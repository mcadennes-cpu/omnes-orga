import { Profile } from '../lib/supabase';
import RappelSauvegarde from './RappelSauvegarde';
import RequestsCalendarView from './RequestsCalendarView';

type RequestsViewProps = {
  currentUser: Profile;
};

export default function RequestsView({ currentUser }: RequestsViewProps) {
  return (
    <div>
      <RappelSauvegarde currentUser={currentUser} />
      <RequestsCalendarView currentUser={currentUser} />
    </div>
  );
}
