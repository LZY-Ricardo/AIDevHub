import { useState } from "react";
import type { ReactNode } from "react";

export type SettingsTab = "profiles" | "backups" | "preferences" | "about";

export interface SettingsTabConfig {
  key: SettingsTab;
  label: string;
  content: ReactNode;
}

export interface SettingsTabsProps {
  tabs: SettingsTabConfig[];
  defaultTab?: SettingsTab;
}

export function SettingsTabs({ tabs, defaultTab = "profiles" }: SettingsTabsProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>(defaultTab);

  const activeContent = tabs.find((tab) => tab.key === activeTab)?.content;

  return (
    <div className="ui-settingsTabs">
      <div className="ui-settingsTabList" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            role="tab"
            aria-selected={activeTab === tab.key}
            onClick={() => setActiveTab(tab.key)}
            className="ui-settingsTabBtn"
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="ui-settingsTabContent" role="tabpanel">
        {activeContent}
      </div>
    </div>
  );
}
