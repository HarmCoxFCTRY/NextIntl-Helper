# NextIntl Helper

NextIntl Helper is a VS Code extension designed to streamline your internationalization (i18n) workflow when working with `next-intl` in your Next.js projects. It provides tools to easily look up translations, manage translation keys, and identify untranslated text directly within your editor.

## Features

This extension provides the following capabilities:

*   **Show Translation:** Quickly view the translation for a selected key.
*   **Insert Translation Key:** Insert a translation key into your code.
*   **Add Translation Key:** Add a new translation key and its value to your localization files.
*   **Add Translation Key From Hover:** (If applicable) Add a translation key based on hovered text.
*   **Add Missing Translations From Hover:** (If applicable) Add missing translations based on hovered text.
*   **Highlight Untranslated Text:** Identify text in your code that hasn't been internationalized.
*   **Translate Selected Text:** (If applicable) Use a translation service to translate selected text.
*   **Find Translation Key for Text:** Search for an existing translation key that matches selected text.

## Usage

Most commands can be accessed via the command palette (`Ctrl+Shift+P` or `Cmd+Shift+P`) by searching for "NextIntl Helper" or their specific titles (e.g., "Show Translation"). Some commands may also be available in the editor context menu or via keybindings (see `package.json` for default keybindings).

## Extension Settings

This extension contributes the following settings (configurable in User or Workspace settings):

*   `nextIntlHelper.autoHighlight`: Enable/disable automatic highlighting of untranslated text (default: `true`).
*   `nextIntlHelper.ignoredPatterns`: Array of string patterns to ignore when highlighting untranslated text (e.g., `className`, `style`).
*   `nextIntlHelper.translationFunction`: The name of the translation function used in your code (default: `"t"`).
*   `nextIntlHelper.translationFilePatterns`: Glob patterns to locate your translation files (default: `["**/messages/*.json", "**/locales/*.json"]`).

## Contributing

[Details on how to contribute, report bugs, or suggest features can be added here.]

## License

[Specify your license, e.g., MIT - if it's in a LICENSE file, you can just link to it.]

