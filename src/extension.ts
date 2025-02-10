import * as vscode from 'vscode';
import { AdtService } from './services/AdtService';
import { PackageHierarchyProvider } from './providers/PackageHierarchyProvider';
import { SidePanel } from './panels/SidePanel';

export function activate(context: vscode.ExtensionContext) {
    console.log('ABAP Tools extension is now active');

    // Add check for required configuration
    const config = vscode.workspace.getConfiguration('abap-tools');
    const host = config.get('defaultHost');
    
    let adtService: AdtService;
    try {
        if (!host) {
            // Show configuration prompt instead of throwing error
            vscode.window.showWarningMessage(
                'SAP host not configured. Would you like to configure it now?',
                'Configure',
                'Later'
            ).then(selection => {
                if (selection === 'Configure') {
                    vscode.commands.executeCommand('workbench.action.openSettings', 'abap-tools');
                }
            });
            // Create service with default values for now
            adtService = new AdtService(true);
        } else {
            adtService = new AdtService();
        }
    } catch (error) {
        console.error('Failed to create ADT service:', error);
        adtService = new AdtService(true); // Create with test mode
    }

    // Add status bar item
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBarItem.text = "$(plug) SAP";
    statusBarItem.tooltip = "SAP Connection (Right-click for options)";
    statusBarItem.command = 'abap-tools.connectSAP';
    statusBarItem.show();

    // Add this near the other status bar item setup
    const sidePanelButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    sidePanelButton.text = "$(tools) ABAP Tools";
    sidePanelButton.tooltip = "Open ABAP Tools Panel";
    sidePanelButton.command = 'abap-tools.openSidePanel';
    sidePanelButton.show();

    // Register status bar menu
    vscode.commands.registerCommand('abap-tools.statusBarMenu', async () => {
        const items = [
            { label: 'Connect to SAP', command: 'abap-tools.connectSAP' },
            { label: 'Show Connection Info', command: 'abap-tools.showConnectionInfo' },
            { label: 'Disconnect', command: 'abap-tools.disconnect' }
        ];
        
        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select SAP Connection Action'
        });
        
        if (selected) {
            vscode.commands.executeCommand(selected.command);
        }
    });

    // Register all commands
    const commands = [
        {
            command: 'abap-tools.helloWorld',
            callback: () => {
                vscode.window.showInformationMessage('Hello from ABAP Tools!');
            }
        },
        {
            command: 'abap-tools.connectSAP',
            callback: async () => {
                const config = vscode.workspace.getConfiguration('abap-tools');
                
                // Show connection details
                const connectionInfo = `Host: ${config.get('defaultHost')}\nPort: ${config.get('defaultPort')}\nClient: ${config.get('defaultClient')}`;
                const proceed = await vscode.window.showInformationMessage(
                    `Connect to SAP System?\n${connectionInfo}`,
                    'Connect', 'Cancel'
                );

                if (proceed === 'Connect') {
                    let username = await vscode.window.showInputBox({ 
                        prompt: 'Enter SAP username',
                        placeHolder: 'Username'
                    });
                    
                    let password = await vscode.window.showInputBox({ 
                        prompt: 'Enter SAP password',
                        password: true,
                        placeHolder: 'Password'
                    });
                    username = "i338631";
                    password = "SSss123456*";
                    if (username && password) {
                        try {
                            await adtService.setCredentials(username, password);
                            const discoveryResult = await adtService.discoverService();
                            statusBarItem.text = "$(check) SAP Connected";
                            vscode.window.showInformationMessage('Successfully connected to SAP system');
                            // Refresh package view after successful connection
                            packageHierarchyProvider.refresh();
                        } catch (error) {
                            statusBarItem.text = "$(alert) SAP Disconnected";
                            vscode.window.showErrorMessage(`Failed to connect: ${error}`);
                        }
                    }
                }
            }
        },
        {
            command: 'abap-tools.discoverAdt',
            callback: async () => {
                const username = await vscode.window.showInputBox({ 
                    prompt: 'Enter SAP username',
                    placeHolder: 'Username'
                });
                
                const password = await vscode.window.showInputBox({ 
                    prompt: 'Enter SAP password',
                    password: true,
                    placeHolder: 'Password'
                });

                if (username && password) {
                    try {
                        await adtService.setCredentials(username, password);
                        await adtService.discoverService();
                    } catch (error) {
                        vscode.window.showErrorMessage(`Failed to discover ADT services: ${error}`);
                    }
                }
            }
        },
        {
            command: 'abap-tools.getObjectStructure',
            callback: async () => {
                const objectUri = await vscode.window.showInputBox({ 
                    prompt: 'Enter ABAP object URI',
                    placeHolder: 'e.g., /sap/bc/adt/programs/programs/zprogram'
                });

                if (objectUri) {
                    try {
                        const structure = await adtService.getObjectStructure(objectUri);
                        const doc = await vscode.workspace.openTextDocument({
                            content: JSON.stringify(structure, null, 2),
                            language: 'json'
                        });
                        await vscode.window.showTextDocument(doc);
                    } catch (error) {
                        vscode.window.showErrorMessage(`Failed to get object structure: ${error}`);
                    }
                }
            }
        },
        {
            command: 'abap-tools.showConnectionInfo',
            callback: async () => {
                try {
                    const connectionInfo = adtService.getConnectionInfo();
                    if (connectionInfo.isConnected) {
                        const message = [
                            `Connected to: ${connectionInfo.url}`,
                            `Username: ${connectionInfo.username}`,
                            'Status: Connected'
                        ].join('\n');
                        vscode.window.showInformationMessage(message);
                    } else {
                        vscode.window.showInformationMessage('Not connected to SAP system');
                    }
                } catch (error) {
                    vscode.window.showErrorMessage(`Error getting connection info: ${error}`);
                }
            }
        },
        {
            command: 'abap-tools.disconnect',
            callback: () => {
                adtService.disconnect();
                statusBarItem.text = "$(plug) SAP";
                vscode.window.showInformationMessage('Disconnected from SAP system');
            }
        },
        {
            command: 'abap-tools.openSidePanel',
            callback: () => {
                SidePanel.createOrShow();
            }
        }
    ];

    // Register all commands
    const disposables = commands.map(({ command, callback }) => 
        vscode.commands.registerCommand(command, callback)
    );

    // Register providers
    const providers = [
        vscode.languages.registerCompletionItemProvider('abap', {
            provideCompletionItems(document: vscode.TextDocument, position: vscode.Position) {
                const completionItems: vscode.CompletionItem[] = [];

                // Basic ABAP keywords
                const keywords = [
                    'REPORT', 'DATA', 'TYPES', 'CLASS', 'METHOD', 'ENDCLASS', 'ENDMETHOD',
                    'IF', 'ELSE', 'ENDIF', 'LOOP', 'ENDLOOP', 'DO', 'ENDDO', 'WHILE', 'ENDWHILE',
                    'SELECT', 'FROM', 'WHERE', 'INTO', 'TABLE', 'APPEND', 'MODIFY', 'DELETE',
                    'FORM', 'ENDFORM', 'PERFORM', 'WRITE', 'CLEAR', 'REFRESH', 'SORT'
                ];
                
                keywords.forEach(keyword => {
                    const item = new vscode.CompletionItem(keyword, vscode.CompletionItemKind.Keyword);
                    completionItems.push(item);
                });

                return completionItems;
            }
        }),
        vscode.languages.registerHoverProvider('abap', {
            provideHover(document: vscode.TextDocument, position: vscode.Position) {
                const range = document.getWordRangeAtPosition(position);
                const word = document.getText(range);

                const hoverMap: { [key: string]: string } = {
                    'REPORT': 'Defines an ABAP program',
                    'DATA': 'Declares a local variable',
                    'TYPES': 'Defines a local data type',
                    'CLASS': 'Defines a local class',
                    'METHOD': 'Defines a method in a class'
                };

                if (hoverMap[word.toUpperCase()]) {
                    return new vscode.Hover(hoverMap[word.toUpperCase()]);
                }
                return null;
            }
        })
    ];

    // Register Package Hierarchy View
    const packageHierarchyProvider = new PackageHierarchyProvider(adtService);
    vscode.window.registerTreeDataProvider(
        'sapPackages',
        packageHierarchyProvider
    );

    // Add refresh command
    context.subscriptions.push(
        ...disposables,
        ...providers,
        statusBarItem,
        sidePanelButton,
        vscode.commands.registerCommand('abap-tools.refreshPackages', () => 
            packageHierarchyProvider.refresh()
        )
    );
}

export function deactivate() {} 