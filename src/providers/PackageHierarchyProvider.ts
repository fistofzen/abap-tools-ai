import * as vscode from 'vscode';
import { AdtService } from '../services/AdtService';
import { CreateClassDialog } from '../dialogs/CreateClassDialog';

export class PackageItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly packageUri?: string,
        public readonly type: 'package' | 'virtualFolder' | 'class' = 'package',
        public readonly counter?: number,
        public readonly facet?: string
    ) {
        super(label, collapsibleState);
        this.tooltip = this.label;
        
        // Set different icons based on type and facet
        switch (type) {
            case 'package':
                this.iconPath = new vscode.ThemeIcon('package');
                break;
            case 'virtualFolder':
                switch (facet) {
                    case 'CLAS':
                        this.iconPath = new vscode.ThemeIcon('symbol-class');
                        break;
                    case 'PROG':
                    case 'REPO':
                        this.iconPath = new vscode.ThemeIcon('file-code');
                        break;
                    case 'INTF':
                        this.iconPath = new vscode.ThemeIcon('symbol-interface');
                        break;
                    case 'FUGR':
                        this.iconPath = new vscode.ThemeIcon('symbol-method');
                        break;
                    case 'TABL':
                        this.iconPath = new vscode.ThemeIcon('database');
                        break;
                    case 'TTYP':
                        this.iconPath = new vscode.ThemeIcon('symbol-enum');
                        break;
                    case 'DTEL':
                        this.iconPath = new vscode.ThemeIcon('symbol-field');
                        break;
                    case 'DOMA':
                        this.iconPath = new vscode.ThemeIcon('symbol-ruler');
                        break;
                    default:
                        this.iconPath = new vscode.ThemeIcon('folder');
                }
                this.description = counter ? `(${counter})` : undefined;
                break;
            case 'class':
                this.iconPath = new vscode.ThemeIcon('symbol-class');
                break;
        }
        
        this.contextValue = type;
    }
}

export class PackageHierarchyProvider implements vscode.TreeDataProvider<PackageItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<PackageItem | undefined | null | void> = new vscode.EventEmitter<PackageItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<PackageItem | undefined | null | void> = this._onDidChangeTreeData.event;

    constructor(private adtService: AdtService) {
        // Register create class command
        vscode.commands.registerCommand('abap-tools.createClass', async (item: PackageItem) => {
            if (!item.packageUri) {
                vscode.window.showErrorMessage('No package selected');
                return;
            }

            const dialog = new CreateClassDialog(item.label);
            const classDetails = await dialog.show();
            
            if (classDetails) {
                try {
                    await this.adtService.createClass(classDetails);
                    this.refresh(); // Refresh the tree view
                    vscode.window.showInformationMessage(`Class ${classDetails.name} created successfully`);
                } catch (error) {
                    vscode.window.showErrorMessage(`Failed to create class: ${error}`);
                }
            }
        });

        // Add double-click handler for both programs and classes
        vscode.commands.registerCommand('abap-tools.openSource', async (item: PackageItem) => {
            if (item.type === 'virtualFolder') {
                try {
                    let source: string;
                    if (item.facet === 'REPO') {
                        source = await this.adtService.getProgramSource(item.label);
                    } else if (item.facet === 'CLAS') {
                        source = await this.adtService.getClassSource(item.label);
                    } else {
                        return;
                    }
                    
                    // Create and show document
                    const document = await vscode.workspace.openTextDocument({
                        content: source,
                        language: 'abap'
                    });
                    await vscode.window.showTextDocument(document);
                    await vscode.commands.executeCommand('editor.action.formatDocument');
                } catch (error) {
                    vscode.window.showErrorMessage(`Failed to open source: ${error}`);
                }
            }
        });
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: PackageItem): vscode.TreeItem {
        const treeItem = element;
        if (element.type === 'virtualFolder' && (element.facet === 'REPO' || element.facet === 'CLAS')) {
            treeItem.command = {
                command: 'abap-tools.openSource',
                title: 'Open Source',
                arguments: [element]
            };
        }
        return treeItem;
    }

    async getChildren(element?: PackageItem): Promise<PackageItem[]> {
        const connectionInfo = this.adtService.getConnectionInfo();
        if (!connectionInfo.isConnected) {
            return [new PackageItem('Not connected to SAP', vscode.TreeItemCollapsibleState.None)];
        }

        try {
            if (!element) {
                // Root level - show main packages
                const packages = await this.adtService.getPackages();
                return packages.map(pkg => 
                    new PackageItem(
                        pkg.name,
                        vscode.TreeItemCollapsibleState.Collapsed,
                        pkg.uri,
                        'package',
                        0,
                        'package'
                    )
                );
            } else if (element.facet === 'package' || element.facet === 'PACKAGE') {
                // Get virtual folders for the package
                const virtualFolders = await this.adtService.getRootPackageContents(element.packageUri!);
                
                // Map virtual folders to tree items
                return virtualFolders.map(folder => 
                    new PackageItem(
                        folder.name,
                        vscode.TreeItemCollapsibleState.Collapsed,
                        element.packageUri,
                        'virtualFolder',
                        folder.counter,
                        folder.facet
                    )
                );
            } else if (element.facet === 'virtualFolder' || element.facet === 'VIRTUALFOLDER') {
                const virtualFolders = await this.adtService.getVirtualFolderContents(element.packageUri!, element.facet!);
                
                return virtualFolders.map(folder => 
                    new PackageItem(
                        folder.name,
                        folder.isExpandable ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
                        element.packageUri,
                        'virtualFolder',
                        folder.counter,
                        folder.facet
                    )
                );
            }
        } catch (error) {
            console.error('Failed to load items:', error);
            return [new PackageItem('Error loading items', vscode.TreeItemCollapsibleState.None)];
        }
        return [];
    }
} 