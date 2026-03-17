/**
 * HealthApp — root federated component for the Health & Fitness tracker.
 *
 * Six tabs: Dashboard, Log, Goals, Insights, Achievements, Profile.
 * Uses useAppState for file-backed reactive state.
 */

import './styles.css';

import { useState, useCallback, useMemo } from 'react';
import { useAppState } from '@sero/app-runtime';
import type { HealthState } from '../shared/types';
import { DEFAULT_STATE } from '../shared/types';
import { Dashboard } from './components/Dashboard';
import { LogList } from './components/LogList';
import { GoalTree } from './components/GoalTree';
import { InsightsView } from './components/InsightsView';
import { AchievementsView } from './components/AchievementsView';
import { ProfileView } from './components/ProfileView';

type Tab = 'dashboard' | 'log' | 'goals' | 'insights' | 'achievements' | 'profile';

const TABS: Array<{ id: Tab; label: string; icon: string }> = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'log', label: 'Log', icon: '📝' },
  { id: 'goals', label: 'Goals', icon: '🎯' },
  { id: 'insights', label: 'Insights', icon: '📈' },
  { id: 'achievements', label: 'Awards', icon: '🏅' },
  { id: 'profile', label: 'Profile', icon: '👤' },
];

export function HealthApp() {
  const [state, updateState] = useAppState<HealthState>(DEFAULT_STATE);
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');

  const handleUpdateState = useCallback(
    (updater: (prev: HealthState) => HealthState) => {
      updateState(updater);
    },
    [updateState],
  );

  // Counts for tab badges
  const logCount = useMemo(
    () => state.nutritionLog.length + state.workoutLog.length,
    [state.nutritionLog.length, state.workoutLog.length],
  );
  const goalCount = state.longTermGoals.length;
  const achievementCount = state.achievements.length;

  return (
    <div className="flex h-full flex-col bg-background text-foreground">
      {/* Tab bar — horizontally scrollable for 6 tabs */}
      <div className="flex shrink-0 overflow-x-auto border-b border-border bg-card/50 scrollbar-none">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          const badge =
            tab.id === 'log' && logCount > 0 ? logCount :
            tab.id === 'goals' && goalCount > 0 ? goalCount :
            tab.id === 'achievements' && achievementCount > 0 ? achievementCount :
            undefined;

          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex shrink-0 items-center gap-1 px-3 py-2.5 text-xs font-medium transition-colors relative ${
                isActive
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground/70'
              }`}
            >
              <span className="text-[11px]">{tab.icon}</span>
              <span>{tab.label}</span>
              {badge !== undefined && (
                <span className="ml-0.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  {badge}
                </span>
              )}
              {isActive && (
                <div className="absolute bottom-0 left-1 right-1 h-0.5 rounded-full bg-primary" />
              )}
            </button>
          );
        })}
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'dashboard' && <Dashboard state={state} />}
        {activeTab === 'log' && (
          <LogList nutritionLog={state.nutritionLog} workoutLog={state.workoutLog} />
        )}
        {activeTab === 'goals' && <GoalTree state={state} />}
        {activeTab === 'insights' && <InsightsView state={state} />}
        {activeTab === 'achievements' && <AchievementsView state={state} />}
        {activeTab === 'profile' && (
          <ProfileView state={state} onUpdateState={handleUpdateState} />
        )}
      </div>
    </div>
  );
}
