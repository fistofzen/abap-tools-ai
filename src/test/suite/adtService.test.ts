import * as assert from 'assert';
import * as vscode from 'vscode';
import { AdtService } from '../../services/AdtService';

suite('ADT Service Test Suite', () => {
    let adtService: AdtService;

    suiteSetup(async function() {
        this.timeout(10000);
        
        try {
            // Set test configuration
            const config = vscode.workspace.getConfiguration('abap-tools');
            await config.update('defaultHost', 'test.sap.server', vscode.ConfigurationTarget.Global);
            await config.update('defaultPort', '44300', vscode.ConfigurationTarget.Global);

            // Wait for extension activation
            await vscode.commands.executeCommand('workbench.action.reloadWindow');
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Verify commands are registered
            const commands = await vscode.commands.getCommands(true);
            const abapCommands = commands.filter(cmd => cmd.startsWith('abap-tools'));
            console.log('Available ABAP commands:', abapCommands);
        } catch (error) {
            console.error('Setup failed:', error);
            throw error;
        }
    });

    test('ADT commands are registered', async () => {
        const commands = await vscode.commands.getCommands(true);
        const abapCommands = commands.filter(cmd => cmd.startsWith('abap-tools'));
        
        // Check for specific commands
        const requiredCommands = [
            'abap-tools.discoverAdt',
            'abap-tools.getObjectStructure',
            'abap-tools.connectSAP',
            'abap-tools.showConnectionInfo',
            'abap-tools.disconnect'
        ];

        for (const cmd of requiredCommands) {
            assert.ok(abapCommands.includes(cmd), `Command ${cmd} not found in available commands: ${abapCommands.join(', ')}`);
        }
    });

    test('Can create ADT service instance', () => {
        adtService = new AdtService();
        assert.ok(adtService instanceof AdtService);
    });
}); 