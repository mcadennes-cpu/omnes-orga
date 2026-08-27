import { supabase } from './supabase';

// ---------------------------------------------------------------------------
// Une semaine type dit QUELLES CASES sont ouvertes -- l'offre. Le plan de
// roulement dit QUI les occupe -- l'affectation. Ce fichier ne s'occupe que de
// la premiere : enregistrer la semaine affichee comme semaine type reutilisable.
//
// `duplicateWeekTemplate` vivait ici jusqu'au 27/08/2026 (8B-1a). Elle rejouait
// une semaine type sur une periode, en posant le roulement par-dessus -- ce que
// fait desormais `agenda.ouvrir_semaines` (6H), et mieux : elle ignorait les
// jours feries et n'ouvrait pas les gardes du roulement absentes de la semaine
// type. Les deux trous que 6H-2 et 6H-3 avaient justement bouches.
// ---------------------------------------------------------------------------

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
    throw new Error('Erreur lors de la création de la semaine type');
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
