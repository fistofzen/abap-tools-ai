import * as vscode from 'vscode';
import { AdtService } from '../services/AdtService';

export class PackageItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly packageUri?: string
    ) {
        super(label, collapsibleState);
        this.tooltip = this.label;
        this.iconPath = new vscode.ThemeIcon('package');
    }
}

export class PackageHierarchyProvider implements vscode.TreeDataProvider<PackageItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<PackageItem | undefined | null | void> = new vscode.EventEmitter<PackageItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<PackageItem | undefined | null | void> = this._onDidChangeTreeData.event;

    constructor(private adtService: AdtService) {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: PackageItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: PackageItem): Promise<PackageItem[]> {
        // Check connection status first
        const connectionInfo = this.adtService.getConnectionInfo();
        if (!connectionInfo.isConnected) {
            return [
                new PackageItem(
                    'Not connected to SAP',
                    vscode.TreeItemCollapsibleState.None
                )
            ];
        }

        if (!element) {
            // Root level - show main packages
            try {
                const packages = await this.adtService.getPackages();
                return packages.map(pkg => 
                    new PackageItem(
                        pkg.name,
                        vscode.TreeItemCollapsibleState.Collapsed,
                        pkg.uri
                    )
                );
            } catch (error) {
                vscode.window.showErrorMessage('Failed to load packages');
                return [
                    new PackageItem(
                        'Error loading packages',
                        vscode.TreeItemCollapsibleState.None
                    )
                ];
            }
        } else if (element.packageUri) {
            // Sub-packages
            try {
                const packages = await this.adtService.getPackages(element.packageUri);
                return packages.map(pkg => 
                    new PackageItem(
                        pkg.name,
                        vscode.TreeItemCollapsibleState.Collapsed,
                        pkg.uri
                    )
                );
            } catch (error) {
                return [];
            }
        }
        return [];
    }
} 