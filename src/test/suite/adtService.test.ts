import * as assert from 'assert';
import * as vscode from 'vscode';
import { AdtService } from '../../services/AdtService';

suite('ADT Service Test Suite', () => {
    let adtService: AdtService;

    setup(() => {
        // Create ADT service in test mode
        adtService = new AdtService(true);
    });

    test('Connection configuration test', () => {
        const connectionInfo = adtService.getConnectionInfo();
        assert.strictEqual(connectionInfo.url, 'https://gclp0285.devint.net.sap:8443/sap/bc/adt');
        assert.strictEqual(connectionInfo.isConnected, false);
    });

    test('Connection command exists', async () => {
        const commands = await vscode.commands.getCommands();
        assert.ok(commands.includes('abap-tools.connectSAP'));
    });

    test('Can create ADT service instance', () => {
        assert.ok(adtService instanceof AdtService);
    });

    test('ADT commands are registered', async () => {
        const commands = await vscode.commands.getCommands();
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
            assert.ok(abapCommands.includes(cmd), `Command ${cmd} not found`);
        }
    });
}); 