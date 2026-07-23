import { supabase } from './supabase';

export async function getCurrentUserId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id || null;
}

export type UndoPayload =
  | {
      type: 'assign_shift';
      shift_id: string;
      previous_assigned_doctor_id: string | null;
      previous_status: string;
    }
  | {
      type: 'unassign_shift';
      shift_id: string;
      previous_assigned_doctor_id: string | null;
      previous_status: string;
    }
  | {
      type: 'validate_request';
      validated_request_id: string;
      shift_id: string;
      previous_shift_assigned_doctor_id: string | null;
      previous_shift_status: string;
      rejected_request_ids: string[];
    }
  | {
      type: 'bulk_shift_create';
      created_shift_ids: string[];
    }
  | {
      type: 'bulk_shift_delete';
      deleted_shifts: any[];
    }
  | {
      type: 'delete_shift';
      deleted_shift: any;
    };

export async function saveUndoAction(
  userId: string,
  description: string,
  payload: UndoPayload
): Promise<void> {
  console.log('[Undo] Saving action:', { description, payload });

  const { error } = await supabase
    .from('undo_buffer')
    .upsert(
      {
        user_id: userId,
        description,
        payload
      },
      { onConflict: 'user_id' }
    );

  if (error) {
    console.error('[Undo] Error saving undo action:', error);
  }
}

export async function getUndoAction(userId: string): Promise<{
  id: string;
  description: string;
  payload: UndoPayload;
  created_at: string;
} | null> {
  const { data, error } = await supabase
    .from('undo_buffer')
    .select('id, description, payload, created_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('[Undo] Error fetching undo action:', error);
    return null;
  }

  return data;
}

export async function clearUndoAction(userId: string): Promise<void> {
  console.log('[Undo] Clearing undo buffer');

  const { error } = await supabase
    .from('undo_buffer')
    .delete()
    .eq('user_id', userId);

  if (error) {
    console.error('[Undo] Error clearing undo action:', error);
  }
}

export async function executeUndo(userId: string): Promise<boolean> {
  const undoAction = await getUndoAction(userId);

  if (!undoAction) {
    console.error('[Undo] No undo action found');
    return false;
  }

  console.log('[Undo] Executing undo:', undoAction.payload.type);

  try {
    switch (undoAction.payload.type) {
      case 'assign_shift':
      case 'unassign_shift': {
        const { shift_id, previous_assigned_doctor_id, previous_status } = undoAction.payload;

        const { error } = await supabase
          .from('shifts')
          .update({
            assigned_doctor_id: previous_assigned_doctor_id,
            status: previous_status
          })
          .eq('id', shift_id);

        if (error) throw error;
        console.log('[Undo] Restored shift assignment');
        break;
      }

      case 'validate_request': {
        const {
          validated_request_id,
          shift_id,
          previous_shift_assigned_doctor_id,
          previous_shift_status,
          rejected_request_ids
        } = undoAction.payload;

        await supabase
          .from('shifts')
          .update({
            assigned_doctor_id: previous_shift_assigned_doctor_id,
            status: previous_shift_status
          })
          .eq('id', shift_id);

        await supabase
          .from('requests')
          .update({ status: 'pending' })
          .eq('id', validated_request_id);

        if (rejected_request_ids.length > 0) {
          await supabase
            .from('requests')
            .update({ status: 'pending' })
            .in('id', rejected_request_ids);
        }

        console.log('[Undo] Restored request validation');
        break;
      }

      case 'bulk_shift_create': {
        const { created_shift_ids } = undoAction.payload;

        if (created_shift_ids.length > 0) {
          const { error } = await supabase
            .from('shifts')
            .delete()
            .in('id', created_shift_ids);

          if (error) throw error;
          console.log('[Undo] Deleted created shifts:', created_shift_ids.length);
        }
        break;
      }

      case 'bulk_shift_delete': {
        const { deleted_shifts } = undoAction.payload;

        if (deleted_shifts.length > 0) {
          const { error } = await supabase
            .from('shifts')
            .insert(deleted_shifts);

          if (error) throw error;
          console.log('[Undo] Restored deleted shifts:', deleted_shifts.length);
        }
        break;
      }

      case 'delete_shift': {
        const { deleted_shift } = undoAction.payload;

        const { error } = await supabase
          .from('shifts')
          .insert(deleted_shift);

        if (error) throw error;
        console.log('[Undo] Restored deleted shift');
        break;
      }

      default:
        console.error('[Undo] Unknown undo type:', (undoAction.payload as any).type);
        return false;
    }

    await clearUndoAction(userId);
    console.log('[Undo] Undo completed successfully');
    return true;
  } catch (error) {
    console.error('[Undo] Error executing undo:', error);
    return false;
  }
}
