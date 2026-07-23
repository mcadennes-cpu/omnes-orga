import { Profile } from '../lib/supabase';
import RequestsCalendarView from './RequestsCalendarView';

type RequestsViewProps = {
  currentUser: Profile;
};

export default function RequestsView({ currentUser }: RequestsViewProps) {
  return <RequestsCalendarView currentUser={currentUser} />;
}
