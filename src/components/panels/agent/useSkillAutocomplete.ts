/**
 * Hook for /skill: autocomplete in the agent chat input.
 */
import { useCallback, useEffect, useState } from 'react';

export interface SkillSuggestion {
  name: string;
  description: string;
}

export function useSkillAutocomplete(projectId: string, input: string) {
  const [allSkills, setAllSkills] = useState<SkillSuggestion[]>([]);
  const [skillSuggestions, setSkillSuggestions] = useState<SkillSuggestion[]>([]);
  const [showSkillAutocomplete, setShowSkillAutocomplete] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);

  // Load skills list for autocomplete
  useEffect(() => {
    (async () => {
      try {
        const skills = await window.sero.skills.list(projectId);
        setAllSkills(skills.filter((s) => s.enabled).map((s) => ({ name: s.name, description: s.description })));
      } catch { /* best effort */ }
    })();
  }, [projectId]);

  // Update skill suggestions when input changes
  useEffect(() => {
    const match = input.match(/\/skill:(\S*)$/);
    if (match) {
      const query = match[1].toLowerCase();
      const filtered = query
        ? allSkills.filter((s) => s.name.toLowerCase().includes(query))
        : allSkills;
      setSkillSuggestions(filtered.slice(0, 8));
      setShowSkillAutocomplete(filtered.length > 0);
      setSelectedSuggestionIndex(0);
    } else {
      setShowSkillAutocomplete(false);
    }
  }, [input, allSkills]);

  const dismiss = useCallback(() => {
    setShowSkillAutocomplete(false);
  }, []);

  return {
    skillSuggestions,
    showSkillAutocomplete,
    selectedSuggestionIndex,
    setSelectedSuggestionIndex,
    dismiss,
  };
}
