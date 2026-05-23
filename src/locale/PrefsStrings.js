import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

/**
 * 偏好窗口文案（须使用 prefs 进程的 gettext；与 prefs.js 中的用法一一对应）。
 */
export const PrefsStrings = {
    get defaultExtensionName() {
        return _('Application Tabs Dev');
    },
    get maintainedBy() {
        return _('Maintained by hhoao');
    },
    get developmentBuild() {
        return _('Development build');
    },
    get version() {
        return _('Version');
    },
    get releaseNotes() {
        return _('Release notes');
    },
    get currentRelease() {
        return _('Current release');
    },
    get releaseSubtitle() {
        return _(
            'Improved application tab experience, dedicated About page, and external links.',
        );
    },
    get extensionListing() {
        return _('Extension listing');
    },
    get applicationTabs() {
        return _('Application Tabs');
    },
    get sourceCode() {
        return _('Source code');
    },
    get github() {
        return _('GitHub');
    },
    get reportAnIssue() {
        return _('Report an issue');
    },
    get issues() {
        return _('Issues');
    },
    get contributors() {
        return _('Contributors');
    },
    get contributorGraph() {
        return _('Contributor graph');
    },
    get about() {
        return _('About');
    },
    get appearance() {
        return _('Appearance');
    },
    get appearanceDescription() {
        return _('Configure how tabs look in the top bar.');
    },
    get panelMaxWidth() {
        return _('Panel max width');
    },
    get enableEllipsisForTabLabels() {
        return _('Enable ellipsis for tab labels');
    },
    get onlyShowTabsOnCurrentWorkspace() {
        return _('Only show tabs on the current workspace');
    },
    get showAddTabButton() {
        return _('Show add tab button');
    },
    get showRecentWindowsMenu() {
        return _('Show recent windows menu');
    },
    get tabAppearanceJson() {
        return _('Tab appearance (JSON)');
    },
    get tabAppearanceJsonDescription() {
        return _('Edit the JSON used to style each application tab.');
    },
    get apply() {
        return _('Apply');
    },
    get format() {
        return _('Format');
    },
    get revert() {
        return _('Revert');
    },
    get restoreDefaults() {
        return _('Restore defaults');
    },
    get general() {
        return _('General');
    },
    get displayMode() {
        return _('Default display mode');
    },
    get displayModePanel() {
        return _('Panel');
    },
    get displayModeStandalone() {
        return _('Standalone');
    },
    get hideTopbarInStandalone() {
        return _('Hide top bar in standalone mode');
    },
    get enableDisplayModeTransition() {
        return _('Animate display mode switching');
    },
    get enableDisplayModeTransitionDescription() {
        return _('Fade the tab bar and slide the top bar when switching display modes.');
    },
    get displayModeTransitionDuration() {
        return _('Transition duration (ms)');
    },
    get displayModeTransitionDurationDescription() {
        return _('Length of the fade in and fade out animation (0–2000 ms).');
    },
    get fixedStandaloneApplications() {
        return _('Fixed standalone applications');
    },
    get fixedStandaloneApplicationsDescription() {
        return _('Applications that always use standalone mode.');
    },
    get noFixedStandaloneApplications() {
        return _('No fixed standalone applications');
    },
    get fixedPanelApplications() {
        return _('Fixed panel applications');
    },
    get fixedPanelApplicationsDescription() {
        return _('Applications that always use panel mode.');
    },
    get noFixedPanelApplications() {
        return _('No fixed panel applications');
    },
};
