# ImageGen Plugin

ImageGen creates images with the Google Gemini API. Open **ImageGen** to generate an image, browse the **Gallery**, or view a result at full size.

## Configure a provider

Set `GEMINI_API_KEY`, or add a Google API key with `/login`. Generation sends the prompt and all reference images to Google. The provider can charge for requests. Check your Google account limits and prices before you generate many images.

## Generate and reuse images

Enter a prompt and select the generation options in the app. You can attach up to four reference images for an edit or remix. The `generate_image` tool accepts the same type of request.

The plugin saves gallery metadata and image files in the workspace:

```text
<workspace>/.sero/apps/imagegen/state.json
<workspace>/.sero/apps/imagegen/images/
```

The gallery tool can read or delete a managed image. Deletion removes the image file and its gallery record. It does not delete copies that you exported, attached elsewhere, or sent to the provider.

If generation fails, first confirm that the API key is available to Sero. Then retry with a small prompt and no attachments. Do not publish prompts, reference images, API keys, or generated images that contain private information.

## Related docs

- [Plugin Catalog](/plugins/catalog)
- [Models and Providers](/guide/models-and-providers)
- [Security / Privacy](/reference/security-privacy)
