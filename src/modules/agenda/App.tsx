import { useState, useEffect } from 'react';
import { supabase, Profile, hasValidConfig } from './lib/supabase';
import LoginPage from './components/LoginPage';
import PasswordChangeModal from './components/PasswordChangeModal';
import Navigation from './components/Navigation';
import EnhancedCalendarView from './components/EnhancedCalendarView';
import MyScheduleView from './components/MyScheduleView';
import DailyScheduleView from './components/DailyScheduleView';
import RequestsView from './components/RequestsView';
import UsersView from './components/UsersView';
import SettingsView from './components/SettingsView';

function App() {
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [currentView, setCurrentView] = useState<'calendar' | 'schedule' | 'daily-schedule' | 'requests' | 'users' | 'settings'>('calendar');

  // Check if Supabase is properly configured
  if (!hasValidConfig) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl p-8 max-w-lg w-full border-l-4 border-red-500">
          <div className="flex items-start mb-4">
            <div className="flex-shrink-0">
              <svg className="h-8 w-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-lg font-semibold text-gray-900">Configuration Error</h3>
              <p className="mt-2 text-sm text-gray-600">
                The application is missing required Supabase environment variables.
              </p>
            </div>
          </div>

          <div className="mt-4 bg-gray-50 rounded-lg p-4">
            <p className="text-sm font-medium text-gray-700 mb-2">Required environment variables:</p>
            <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
              <li><code className="bg-gray-200 px-2 py-1 rounded">VITE_SUPABASE_URL</code></li>
              <li><code className="bg-gray-200 px-2 py-1 rounded">VITE_SUPABASE_ANON_KEY</code></li>
            </ul>
          </div>

          <div className="mt-6 bg-blue-50 border-l-4 border-blue-400 p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-blue-700">
                  <strong>For deployment:</strong> These variables must be available during the build process, not just at runtime.
                  Check your deployment platform's documentation for setting build-time environment variables.
                </p>
              </div>
            </div>
          </div>

          <button
            onClick={() => window.location.reload()}
            className="mt-6 w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            Reload Page
          </button>
        </div>
      </div>
    );
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        loadProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        loadProfile(session.user.id);
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const loadProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (!error && data) {
      setProfile(data);
      setShowPasswordChange(data.must_change_password);
    }
    setLoading(false);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setCurrentView('calendar');
  };

  const handlePasswordChanged = () => {
    setShowPasswordChange(false);
    if (session) {
      loadProfile(session.user.id);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
        <div className="text-xl text-gray-600">Chargement...</div>
      </div>
    );
  }

  if (!session || !profile) {
    return <LoginPage />;
  }

  if (showPasswordChange) {
    return <PasswordChangeModal onSuccess={handlePasswordChanged} />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <Navigation
        currentUser={profile}
        currentView={currentView}
        onViewChange={setCurrentView}
        onSignOut={handleSignOut}
      />

      <main className="w-full mx-auto px-4 md:px-8 py-8">
        {currentView === 'calendar' && <EnhancedCalendarView currentUser={profile} />}
        {currentView === 'schedule' && profile.role === 'doctor' && (
          <MyScheduleView currentUser={profile} />
        )}
        {currentView === 'daily-schedule' && profile.role === 'doctor' && (
          <DailyScheduleView />
        )}
        {currentView === 'requests' && profile.role === 'coordinator' && (
          <RequestsView currentUser={profile} />
        )}
        {currentView === 'users' && profile.role === 'coordinator' && (
          <UsersView currentUser={profile} />
        )}
        {currentView === 'settings' && profile.role === 'coordinator' && (
          <SettingsView />
        )}
      </main>

      <footer className="mt-12 py-6 text-center text-sm text-gray-600 border-t border-gray-200">
        <p>© 2025 OMNÈS MÉDECINS • une équipe • 7j/7 • sur rendez-vous</p>
      </footer>
    </div>
  );
}

export default App;
