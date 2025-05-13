// translation-helper/extension.js
const vscode = require("vscode");
const fs = require("fs");
const path = require("path");

function activate(context) {
  console.log("Translation Helper extension is now active");

  // Command to show translation tooltip
  let disposable = vscode.commands.registerCommand(
    "translationHelper.showTranslation",
    async function () {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage("No active editor!");
        return;
      }

      // Get current selection or word under cursor
      const selection = editor.selection;
      let translationKey;
      if (selection.isEmpty) {
        // No selection, try to find t() pattern under cursor
        const document = editor.document;
        const cursorPosition = selection.active;
        const line = document.lineAt(cursorPosition.line).text;

        // Match t("path.to.key") pattern
        const regex = /t\(["']([\w\.]+)["']\)/g;
        let match;
        let foundKey = null;

        while ((match = regex.exec(line)) !== null) {
          const keyStart = document.positionAt(
            document.offsetAt(new vscode.Position(cursorPosition.line, 0)) +
              match.index +
              3
          );
          const keyEnd = document.positionAt(
            document.offsetAt(new vscode.Position(cursorPosition.line, 0)) +
              match.index +
              3 +
              match[1].length
          );

          if (
            cursorPosition.isAfterOrEqual(keyStart) &&
            cursorPosition.isBeforeOrEqual(keyEnd)
          ) {
            foundKey = match[1];
            break;
          }
        }

        if (foundKey) {
          translationKey = foundKey;
        } else {
          // Try to detect if cursor is inside a t("...") call
          const fullLine = line;
          const cursorChar = cursorPosition.character;

          const beforeCursor = fullLine.substring(0, cursorChar);
          const afterCursor = fullLine.substring(cursorChar);

          const lastTBeforeCursor = beforeCursor.lastIndexOf('t("');
          const lastSingleQuoteTBeforeCursor = beforeCursor.lastIndexOf("t('");

          if (lastTBeforeCursor >= 0 || lastSingleQuoteTBeforeCursor >= 0) {
            const quoteType = lastTBeforeCursor >= 0 ? '"' : "'";
            const tStart =
              lastTBeforeCursor >= 0
                ? lastTBeforeCursor
                : lastSingleQuoteTBeforeCursor;
            const closingQuoteAfterCursor = afterCursor.indexOf(quoteType);

            if (closingQuoteAfterCursor >= 0) {
              const startOfKey = tStart + 3; // After t("
              const keyFragment =
                beforeCursor.substring(startOfKey) +
                afterCursor.substring(0, closingQuoteAfterCursor);
              translationKey = keyFragment;
            }
          }
        }
      } else {
        // Use selection
        translationKey = editor.document.getText(selection);

        // If selection contains t("key"), extract just the key
        const match = translationKey.match(/t\(["'](.+)["']\)/);
        if (match) {
          translationKey = match[1];
        }
      }

      if (!translationKey) {
        vscode.window.showInformationMessage(
          "No translation key found under cursor"
        );
        return;
      }

      // Find translation files
      try {
        // Try to find the project root by looking for package.json
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
          vscode.window.showErrorMessage("No workspace folder open");
          return;
        }

        const workspaceRoot = workspaceFolders[0].uri.fsPath;

        // Common paths for translation files
        const possiblePaths = [
          path.join(workspaceRoot, "messages", "en.json"),
          path.join(workspaceRoot, "locales", "en.json"),
          path.join(workspaceRoot, "public", "locales", "en", "common.json"),
          path.join(workspaceRoot, "src", "messages", "en.json"),
          path.join(workspaceRoot, "src", "locales", "en.json"),
          // Add the actual paths from your project
          path.join(workspaceRoot, "messages", "en.json"),
          path.join(workspaceRoot, "messages", "nl.json"),
        ];

        // Try to find translation files
        const translations = {};
        let translationFilesFound = false;

        for (const filePath of possiblePaths) {
          if (fs.existsSync(filePath)) {
            translationFilesFound = true;
            const lang = path.basename(filePath, ".json");
            const content = fs.readFileSync(filePath, "utf8");
            translations[lang] = JSON.parse(content);
          }
        }

        if (!translationFilesFound) {
          // If standard locations don't work, try to find files using glob
          const files = await vscode.workspace.findFiles(
            "**/*.json",
            "**/node_modules/**"
          );

          for (const file of files) {
            const content = await vscode.workspace.fs.readFile(file);
            const jsonContent = Buffer.from(content).toString("utf8");

            try {
              const json = JSON.parse(jsonContent);

              // Heuristic to detect if this is a translation file
              if (hasNestedStructure(json) && hasCommonTranslationKeys(json)) {
                const fileName = path.basename(file.fsPath);
                const lang = fileName.replace(".json", "");
                translations[lang] = json;
                translationFilesFound = true;
              }
            } catch (e) {
              // Skip files that can't be parsed as JSON
            }
          }
        }

        if (!translationFilesFound) {
          vscode.window.showErrorMessage("No translation files found");
          return;
        }

        // Get the translation value from the key path
        const results = {};
        let atLeastOneFound = false;

        for (const [lang, content] of Object.entries(translations)) {
          const value = getNestedProperty(content, translationKey);
          if (value !== undefined) {
            results[lang] = value;
            atLeastOneFound = true;
          }
        }

        if (!atLeastOneFound) {
          vscode.window.showWarningMessage(
            `Translation key "${translationKey}" not found in any language file`
          );
          return;
        }

        // Show the results
        const message = Object.entries(results)
          .map(([lang, value]) => `${lang}: "${value}"`)
          .join("\n");

        vscode.window.showInformationMessage(message, { modal: false });
      } catch (error) {
        vscode.window.showErrorMessage(
          `Error getting translation: ${error.message}`
        );
      }
    }
  );

  // Command to insert translation key
  let insertDisposable = vscode.commands.registerCommand(
    "translationHelper.insertTranslationKey",
    async function () {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return;
      }

      // Try to find available translation files
      try {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
          vscode.window.showErrorMessage("No workspace folder open");
          return;
        }

        const workspaceRoot = workspaceFolders[0].uri.fsPath;

        // Common paths where translation files might be located
        const possiblePaths = [
          path.join(workspaceRoot, "messages", "en.json"),
          path.join(workspaceRoot, "locales", "en.json"),
          path.join(workspaceRoot, "messages", "nl.json"),
        ];

        let translationFile = null;

        for (const filePath of possiblePaths) {
          if (fs.existsSync(filePath)) {
            translationFile = filePath;
            break;
          }
        }

        if (!translationFile) {
          vscode.window.showErrorMessage("No translation files found");
          return;
        }

        // Read the translation file
        const content = fs.readFileSync(translationFile, "utf8");
        const translations = JSON.parse(content);

        // Create a flattened list of all keys
        const allKeys = flattenKeys(translations);

        // Show quick pick to select a key
        const selectedKey = await vscode.window.showQuickPick(
          allKeys.map((entry) => ({
            label: entry.key,
            description: `${entry.value}`,
            detail: entry.key,
          })),
          {
            placeHolder: "Select a translation key",
            matchOnDescription: true,
            matchOnDetail: true,
          }
        );

        if (selectedKey) {
          // Insert t("selected.key") at current position
          editor.edit((editBuilder) => {
            editBuilder.insert(
              editor.selection.active,
              `t("${selectedKey.label}")`
            );
          });
        }
      } catch (error) {
        vscode.window.showErrorMessage(`Error: ${error.message}`);
      }
    }
  );

  // Hover provider to show translations on hover
  const hoverProvider = vscode.languages.registerHoverProvider(
    ["javascript", "javascriptreact", "typescript", "typescriptreact"],
    {
      async provideHover(document, position, token) {
        // Check if the hover is over a t("...") call
        const range = document.getWordRangeAtPosition(position);
        if (!range) return;

        const line = document.lineAt(position.line).text;
        const wordAtPosition = document.getText(range);

        // Check if we're inside a t() call
        const tCallMatch = line.match(/t\(["']([^"']+)["']\)/g);
        if (!tCallMatch) return;

        // For each t() call on this line, check if our position is within it
        for (const match of tCallMatch) {
          const startIndex = line.indexOf(match);
          if (startIndex === -1) continue;

          const endIndex = startIndex + match.length;
          const matchStartPos = new vscode.Position(position.line, startIndex);
          const matchEndPos = new vscode.Position(position.line, endIndex);

          const matchRange = new vscode.Range(matchStartPos, matchEndPos);

          if (matchRange.contains(position)) {
            // Extract the key
            const keyMatch = match.match(/t\(["']([^"']+)["']\)/);
            if (!keyMatch) continue;

            const translationKey = keyMatch[1];

            // Find translations
            try {
              const workspaceFolders = vscode.workspace.workspaceFolders;
              if (!workspaceFolders) return;

              const workspaceRoot = workspaceFolders[0].uri.fsPath;

              // Common paths for translation files
              const possiblePaths = [
                path.join(workspaceRoot, "messages", "en.json"),
                path.join(workspaceRoot, "locales", "en.json"),
                path.join(workspaceRoot, "messages", "nl.json"),
              ];

              // Try to find translation files
              const translations = {};

              for (const filePath of possiblePaths) {
                if (fs.existsSync(filePath)) {
                  const lang = path.basename(filePath, ".json");
                  const content = fs.readFileSync(filePath, "utf8");
                  translations[lang] = JSON.parse(content);
                }
              }

              // Get the translation value from the key path
              const results = {};

              for (const [lang, content] of Object.entries(translations)) {
                const value = getNestedProperty(content, translationKey);
                if (value !== undefined) {
                  results[lang] = value;
                }
              }

              if (Object.keys(results).length === 0) {
                return new vscode.Hover(
                  `Translation key not found: ${translationKey}`,
                  matchRange
                );
              }

              // Create markdown text with translations
              const markdownStrings = Object.entries(results).map(
                ([lang, value]) => `**${lang}**: ${value}`
              );

              return new vscode.Hover(markdownStrings, matchRange);
            } catch (error) {
              // In case of error, show error message
              return new vscode.Hover(
                `Error getting translation: ${error.message}`,
                matchRange
              );
            }
          }
        }
      },
    }
  );

  context.subscriptions.push(disposable, insertDisposable, hoverProvider);
}

// Helper function to get nested property from object using dot notation
function getNestedProperty(obj, path) {
  const properties = path.split(".");
  let result = obj;

  for (const prop of properties) {
    if (result === undefined || result === null) {
      return undefined;
    }
    result = result[prop];
  }

  return result;
}

// Helper function to check if an object has a nested structure (likely a translation file)
function hasNestedStructure(obj) {
  return Object.values(obj).some(
    (value) => typeof value === "object" && value !== null
  );
}

// Helper function to check if an object has common translation keys
function hasCommonTranslationKeys(obj) {
  const commonKeys = [
    "common",
    "general",
    "buttons",
    "forms",
    "navigation",
    "errors",
  ];
  return Object.keys(obj).some((key) => commonKeys.includes(key));
}

// Helper function to flatten nested keys for quick pick
function flattenKeys(obj, prefix = "") {
  let result = [];

  for (const [key, value] of Object.entries(obj)) {
    const newKey = prefix ? `${prefix}.${key}` : key;

    if (typeof value === "object" && value !== null) {
      result = [...result, ...flattenKeys(value, newKey)];
    } else {
      result.push({ key: newKey, value: value });
    }
  }

  return result;
}

function deactivate() {}

module.exports = {
  activate,
  deactivate,
};
