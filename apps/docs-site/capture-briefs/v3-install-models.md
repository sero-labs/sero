# V3 installation and models capture brief

## Replace `img13.jpg`

- **Page and purpose:** `/guide/models-and-providers`; show where a user manages
  model visibility and local providers.
- **Route and screen:** Open a workspace chat, open the model selector, select
  its gear icon, and show the **Model Manager** dialog on the **All Models** tab.
- **State:** Use a disposable profile with one healthy hosted provider and one
  LM Studio local provider. Mark one model as a favourite and hide one model.
  Keep the provider groups expanded so these states are clear.
- **Visible controls:** Show **Model Manager**, **All Models**, **Favourites**,
  **Hidden**, **Local**, and the model search field.
- **Do not show:** API keys, OAuth details, private provider endpoints, personal
  profile names, workspace paths, prompts, session text, or account details.
- **Viewport and crop:** Capture the Sero desktop at 1440 × 900 CSS pixels.
  Crop to the complete dialog with a narrow shell margin. Save the replacement
  as `apps/docs-site/docs/assets/generated/img13.jpg`.
- **Check:** Compare every visible label with
  `apps/desktop/src/components/layout/models/model-manager/ModelManagerDialog.tsx`
  and `ModelManagerTabBar.tsx`. Confirm that the displayed model states match
  the disposable profile before publication.
