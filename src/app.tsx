import React, { useState } from "react";
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
    const [activeTab, setActiveTab] = useState<string | number>("users");
    const location = useCockpitLocation();

    // path[0] present → user detail page
    if (location.path.length > 0) {
        return (
            <Page sidebar={null}>
                <UserDetailPage username={location.path[0]} />
            </Page>
        );
    }

    return (
        <Page sidebar={null}>
            <PageSection>
                <Title headingLevel="h1" size="2xl">Samba AD DC</Title>
            </PageSection>
            <PageSection type="tabs" padding={{ default: "noPadding" }}>
                <Tabs
                    activeKey={activeTab}
                    onSelect={(_e, key) => setActiveTab(key)}
                    mountOnEnter
                >
                    <Tab eventKey="users" title={<TabTitleText>Users</TabTitleText>}>
                        <UsersPage />
                    </Tab>
                    <Tab eventKey="groups" title={<TabTitleText>Groups</TabTitleText>}>
                        <GroupsPage />
                    </Tab>
                    <Tab eventKey="computers" title={<TabTitleText>Computers</TabTitleText>}>
                        <ComputersPage />
                    </Tab>
                </Tabs>
            </PageSection>
        </Page>
    );
}
