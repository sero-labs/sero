# V9 built-in plugin capture briefs

Do not replace the current media until each capture is approved. Use a disposable profile and synthetic content. Do not show personal paths, credentials, provider account details, private code, or session history.

## Design Library first design

- **Route:** `/plugins/design-library`
- **Application state:** Open **Design Library** on a completed design. Show one named variant in the preview, the desktop width control, and the **Files** tab. Use two synthetic references named `Transit dashboard` and `Field notes`.
- **Purpose:** Support the steps for checking a generated result and its files.
- **Viewport:** 1440 × 900 application viewport at 100% scale.
- **Crop:** Include the Design rail, full preview, width controls, and inspector. Exclude the Sero profile switcher and operating-system menu bar.
- **Safety:** Generated content must use local shapes and text only. It must not contain remote URLs, forms, real brands, or personal data.
- **Replacement file:** `apps/docs-site/docs/assets/images/design-library-first-design.png`
- **Accuracy check:** The visible tabs and controls must match `DesignPage.tsx`, `PreviewControls.tsx`, and `VariantInspector.tsx` at capture time.

## Graphify indexed workspace

- **Route:** `/plugins/graphify`
- **Application state:** Open **Graphify** with one synthetic workspace named `sample-storefront` in the **indexed** state. Show non-zero node, edge, and community counts. Enter `What calls the authentication module?` and show a result with only synthetic paths.
- **Purpose:** Show where the user enables indexing and checks a profile search result.
- **Viewport:** 1280 × 800 application viewport at 100% scale.
- **Crop:** Include the Graphify header, **Index all**, search card, result, and the complete workspace card.
- **Safety:** Use a disposable public fixture. Do not show a home directory, token count from private code, provider key, or private repository name.
- **Replacement file:** `apps/docs-site/docs/assets/images/graphify.jpg`
- **Accuracy check:** Compare **Index all**, **Search across all indexed workspaces…**, status badges, and card controls with `GraphifyApp.tsx`.

## User Feedback questionnaire

- **Route:** `/plugins/user-feedback`
- **Application state:** Open **User Feedback** on the **Review** step of a three-question synthetic questionnaire. Show two answered questions and one skipped question. Use labels `Audience`, `Format`, and `Deadline`.
- **Purpose:** Show that questionnaires use the app, support skipped questions, and have a review step before submission.
- **Viewport:** 1280 × 800 application viewport at 100% scale.
- **Crop:** Include the **Questionnaire** title, all step buttons, review cards, **Cancel**, and **Submit All Answers**.
- **Safety:** Use project-neutral answers. Do not show Chat history, workspace names, private requirements, or a real output path.
- **Replacement file:** `apps/docs-site/docs/assets/images/user-feedback-questionnaire.png`
- **Accuracy check:** Compare the controls with `QuestionnaireForm.tsx` and `QuestionnaireReviewStep.tsx`. A skipped question step button is neutral when it is not active. Its review card is amber. The **Review** step button is amber when one or more answers are incomplete. Also check **Edit** and **Submit All Answers**.
