import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Page,
  PageSection,
  Title,
  Tabs,
  Tab,
  TabTitleText,
} from "@patternfly/react-core";
import { UsersPage } from "./components/UsersPage.tsx";
import { GroupsPage } from "./components/GroupsPage.tsx";
import { ComputersPage } from "./components/ComputersPage.tsx";
import { UserDetailPage } from "./components/UserDetailPage.tsx";
import { useCockpitLocation } from "./lib/hooks.ts";

export function App() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<string | number>("users");
  const location = useCockpitLocation();
  const detailUsername = location.path.length > 0 ? location.path[0] : null;

  return (
    <Page sidebar={null}>
      {/* Main layout — always in DOM to preserve UsersPage filter/sort state */}
      <div hidden={detailUsername !== null}>
        <PageSection>
          <Title headingLevel="h1" size="2xl">
            Samba DC
          </Title>
        </PageSection>
        <PageSection type="tabs" padding={{ default: "noPadding" }}>
          <Tabs
            activeKey={activeTab}
            onSelect={(_e, key) => setActiveTab(key)}
            mountOnEnter
          >
            <Tab eventKey="users" title={<TabTitleText>{t("Users")}</TabTitleText>}>
              <UsersPage />
            </Tab>
            <Tab eventKey="groups" title={<TabTitleText>{t("Groups")}</TabTitleText>}>
              <GroupsPage />
            </Tab>
            <Tab
              eventKey="computers"
              title={<TabTitleText>{t("Computers")}</TabTitleText>}
            >
              <ComputersPage />
            </Tab>
          </Tabs>
        </PageSection>
      </div>

      {detailUsername !== null && <UserDetailPage username={detailUsername} />}
    </Page>
  );
}
