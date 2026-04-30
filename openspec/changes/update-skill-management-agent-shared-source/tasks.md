## 1. Backend discovery
- [ ] 1.1 Add user home `.agents/skills` path resolution to runtime/app paths
- [ ] 1.2 Extend skill discovery records with source/origin metadata, read-only capability metadata, and a dedicated shared-agent identifier namespace
- [ ] 1.3 Scan `.agents/skills/*/SKILL.md` as directory-based shared skills and expose them through `skill_list`
- [ ] 1.4 Keep shared agent skills inspectable through `skill_get` without adding toggle or deployment behavior

## 2. Frontend presentation
- [ ] 2.1 Update shared types and labels for the new discovery source metadata
- [ ] 2.2 Make discovery filtering source-based for external skills and add an `Agent` source filter option with unambiguous behavior
- [ ] 2.3 Render shared agent skills as read-only and disable mutating actions with clear affordances

## 3. Verification
- [ ] 3.1 Add or update tests for `.agents/skills` discovery and filtering
- [ ] 3.2 Add or update tests for read-only UI behavior of shared agent skills
