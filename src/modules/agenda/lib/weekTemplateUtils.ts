import { supabase } from './supabase';
import { getRotationPlans, getPlanForDate, getRotationWeek } from './rotationUtils';
import { saveUndoAction, getCurrentUserId } from './undoUtils';

export async function saveWeekAsTemplate(
  weekStart: Date,
  templateName: string,
  userId: string
): Promise<void> {
  console.log('[WeekTemplate] Saving week as template:', { weekStart, templateName });

  const weekDates = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + i);
    weekDates.push(date.toISOString().split('T')[0]);
  }

  const { data: shifts, error: shiftsError } = await supabase
    .from('shifts')
    .select('date, site_id, room_id, shift_type_id')
    .in('date', weekDates);

  if (shiftsError) {
    console.error('[WeekTemplate] Error loading shifts:', shiftsError);
    throw new Error('Erreur lors du chargement des gardes');
  }

  if (!shifts || shifts.length === 0) {
    throw new Error('Aucune garde trouvée pour cette semaine');
  }

  const { data: template, error: templateError } = await supabase
    .from('opening_week_templates')
    .insert({
      name: templateName,
      created_by: userId
    })
    .select()
    .single();

  if (templateError || !template) {
    console.error('[WeekTemplate] Error creating template:', templateError);
    throw new Error('Erreur lors de la création du modèle');
  }

  const uniqueOpenings = new Map<string, any>();

  shifts.forEach(shift => {
    const shiftDate = new Date(shift.date + 'T12:00:00');
    const weekday = shiftDate.getDay() === 0 ? 6 : shiftDate.getDay() - 1;
    const key = `${weekday}-${shift.site_id}-${shift.room_id}-${shift.shift_type_id}`;

    if (!uniqueOpenings.has(key)) {
      uniqueOpenings.set(key, {
        template_id: template.id,
        weekday,
        site_id: shift.site_id,
        room_id: shift.room_id,
        shift_type_id: shift.shift_type_id,
        is_open: true
      });
    }
  });

  const items = Array.from(uniqueOpenings.values());

  if (items.length === 0) {
    await supabase.from('opening_week_templates').delete().eq('id', template.id);
    throw new Error('Aucune ouverture unique trouvée');
  }

  const { error: itemsError } = await supabase
    .from('opening_week_template_items')
    .insert(items);

  if (itemsError) {
    console.error('[WeekTemplate] Error creating items:', itemsError);
    await supabase.from('opening_week_templates').delete().eq('id', template.id);
    throw new Error('Erreur lors de la sauvegarde des ouvertures');
  }

  console.log('[WeekTemplate] Template saved successfully:', {
    templateId: template.id,
    itemsCount: items.length
  });
}

export async function duplicateWeekTemplate(
  templateId: string,
  startDate: string,
  endDate: string
): Promise<{ created: number; skipped: number }> {
  console.log('[WeekTemplate] Starting duplication:', { templateId, startDate, endDate });

  const start = new Date(startDate + 'T12:00:00');
  if (start.getDay() !== 1) {
    console.error('[WeekTemplate] blocked reason=not_monday, weekday=', start.getDay());
    throw new Error('La duplication de modèle de semaine doit commencer un LUNDI. Veuillez choisir un lundi comme premier jour.');
  }

  const { data: existingShifts, error: checkError } = await supabase
    .from('shifts')
    .select('id')
    .gte('date', startDate)
    .lte('date', endDate)
    .limit(1);

  if (checkError) {
    console.error('[WeekTemplate] Error checking existing shifts:', checkError);
    throw new Error('Erreur lors de la vérification du calendrier');
  }

  if (existingShifts && existingShifts.length > 0) {
    console.error('[WeekTemplate] blocked reason=calendar_not_empty');
    throw new Error('La duplication de modèle de semaine n\'est possible que sur un calendrier VIDE. La période sélectionnée contient déjà des ouvertures.');
  }

  const { data: items, error: itemsError } = await supabase
    .from('opening_week_template_items')
    .select('weekday, site_id, room_id, shift_type_id')
    .eq('template_id', templateId);

  if (itemsError || !items) {
    console.error('[WeekTemplate] Error loading template items:', itemsError);
    throw new Error('Erreur lors du chargement du modèle');
  }

  const rotationPlans = await getRotationPlans();
  const { data: rotationRules } = await supabase
    .from('rotation_plan_rules')
    .select('plan_id, doctor_id, site_id, shift_type_id, weekday, rotation_week');

  const { data: sites } = await supabase
    .from('sites')
    .select('id, name');

  const { data: rooms } = await supabase
    .from('rooms')
    .select('id, name');

  const { data: shiftTypes } = await supabase
    .from('shift_types')
    .select('id, name, time_range');

  const siteMap = new Map(sites?.map(s => [s.id, s.name]) || []);
  const roomMap = new Map(rooms?.map(r => [r.id, r.name]) || []);
  const shiftTypeMap = new Map(shiftTypes?.map(st => [st.id, st.time_range || st.name]) || []);

  let created = 0;
  let skipped = 0;
  const shiftsToCreate: any[] = [];

  const currentDate = new Date(startDate + 'T12:00:00');
  const endDateObj = new Date(endDate + 'T12:00:00');

  while (currentDate <= endDateObj) {
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    const day = String(currentDate.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    const localWeekday = currentDate.getDay();
    const weekday = localWeekday === 0 ? 6 : localWeekday - 1;

    const matchingItems = items.filter(item => item.weekday === weekday);

    for (const item of matchingItems) {
      const { data: existing } = await supabase
        .from('shifts')
        .select('id')
        .eq('date', dateStr)
        .eq('site_id', item.site_id)
        .eq('room_id', item.room_id)
        .eq('shift_type_id', item.shift_type_id)
        .single();

      if (existing) {
        skipped++;
        continue;
      }

      let assignedDoctorId = null;
      let status = 'free';

      // Chaque jour genere resout son propre plan : une periode a cheval sur
      // deux roulements applique le bon de part et d'autre.
      const plan = rotationRules ? getPlanForDate(currentDate, rotationPlans) : null;

      if (plan && rotationRules) {
        const rotationWeek = getRotationWeek(
          currentDate,
          plan,
          { componentName: 'weekTemplateUtils.applyWeekTemplate', inputOrigin: `generated shift date: ${currentDate.toString()}` }
        );
        const jsWeekday = localWeekday;

        // Plus de comparaison de salle depuis 6B-3 : elle appartient au
        // creneau, pas au roulement.
        const matchingRule = rotationRules.find(rule =>
          rule.plan_id === plan.id &&
          rule.site_id === item.site_id &&
          rule.shift_type_id === item.shift_type_id &&
          rule.weekday === jsWeekday &&
          rule.rotation_week === rotationWeek
        );

        if (matchingRule) {
          assignedDoctorId = matchingRule.doctor_id;
          status = 'assigned';
          console.log('[WeekTemplate] Auto-assigned via rotation rule:', {
            date: dateStr,
            rotationWeek,
            doctorId: assignedDoctorId
          });
        } else {
          console.log('[WeekTemplate] No rotation rule found, creating free shift:', {
            date: dateStr,
            rotationWeek,
            weekday: jsWeekday
          });
        }
      }

      const siteName = siteMap.get(item.site_id);
      const roomName = roomMap.get(item.room_id);
      const shiftTypeName = shiftTypeMap.get(item.shift_type_id);

      shiftsToCreate.push({
        date: dateStr,
        location: siteName || 'Dijon',
        room: roomName || 'Unknown',
        shift_type: shiftTypeName || 'Unknown',
        site_id: item.site_id,
        room_id: item.room_id,
        shift_type_id: item.shift_type_id,
        status,
        assigned_doctor_id: assignedDoctorId
      });
      created++;
    }

    currentDate.setDate(currentDate.getDate() + 1);
  }

  if (shiftsToCreate.length > 0) {
    const { data: insertedShifts, error: insertError } = await supabase
      .from('shifts')
      .insert(shiftsToCreate)
      .select('id');

    if (insertError) {
      console.error('[WeekTemplate] Error creating shifts:', insertError);
      throw new Error('Erreur lors de la création des gardes');
    }

    const userId = await getCurrentUserId();
    if (userId && insertedShifts) {
      const createdIds = insertedShifts.map(s => s.id);
      await saveUndoAction(
        userId,
        `Duplication de modèle (${createdIds.length} gardes créées)`,
        {
          type: 'bulk_shift_create',
          created_shift_ids: createdIds
        }
      );
    }
  }

  console.log('[WeekTemplate] Duplication completed:', { created, skipped });

  return { created, skipped };
}
