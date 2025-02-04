import * as vscode from 'vscode';
import { AdtService } from '../services/AdtService';
import { CreateClassDialog } from '../dialogs/CreateClassDialog';

export class PackageItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly packageUri?: string,
        public readonly type: 'package' | 'virtualFolder' | 'class' = 'package',
        public readonly counter?: number
    ) {
        super(label, collapsibleState);
        this.tooltip = this.label;
        
        switch (type) {
            case 'package':
                this.iconPath = new vscode.ThemeIcon('package');
                break;
            case 'virtualFolder':
                this.iconPath = new vscode.ThemeIcon('folder');
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
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: PackageItem): vscode.TreeItem {
        return element;
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
                        'package'
                    )
                );
            } else if (element.type === 'package') {
                // Get virtual folders for the package
                const virtualFolders = await this.adtService.getRootPackageContents(element.packageUri!);
                
                // Map virtual folders to tree items
                return virtualFolders.map(folder => 
                    new PackageItem(
                        folder.name,
                        vscode.TreeItemCollapsibleState.Collapsed,
                        element.packageUri,
                        'virtualFolder',
                        folder.counter
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