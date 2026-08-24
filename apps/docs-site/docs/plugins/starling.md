# Starling Bank Plugin

The Starling Bank plugin is an external plugin. Install it from its owner with this source:

```text
git:https://github.com/monobyte/sero-starling-plugin.git
```

The plugin shows balances, transactions, savings goals, and spending information. It only reads data from Starling. Its current Personal Access Token scopes are:

- `account:read`
- `balance:read`
- `transaction:read`
- `savings-goal:read`

Create the token at [developer.starlingbank.com](https://developer.starlingbank.com). The plugin needs an internet connection and sends authenticated GET requests to `https://api.starlingbank.com/api/v2`. The app also requests Google Fonts from `fonts.googleapis.com` when it loads its styles.

## Protect access

On first use, enter the token and set a PIN of 4 to 8 digits. Sero encrypts the token through Electron `safeStorage`. The plugin stores the encrypted token, a random PIN salt, a salted SHA-256 PIN hash, and cached bank data in `~/.sero-ui/apps/starling/state.json`.

The PIN is an app lock. It is not an encryption key, and the source does not set an attempt limit or delay for an incorrect PIN. Use the operating-system account lock for device security.

**Lock dashboard** removes the decrypted token from app memory but keeps the encrypted token and cached data. **Forget account** resets the token, PIN data, and cache. The agent `starling` tool can show cached status or clear all stored plugin data. It cannot request live banking data.

## Platform requirements

The package manifest requires Sero 0.1.0 or later and runtime ABI 3. The safe-storage bridge and host network bridge require the Sero desktop app. The repository also documents Pi CLI installation, but its dashboard security and network behavior depend on Sero host bridges.

Do not include tokens, account identifiers, balances, or transactions in screenshots and public support reports.

## Related docs

- [Plugin Catalog](/plugins/catalog)
- [App Store, Favorites, and Installed Plugins](/guide/app-store-favorites)
- [Security / Privacy](/reference/security-privacy)
