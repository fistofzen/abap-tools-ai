import * as assert from 'assert';
import * as vscode from 'vscode';
import * as chai from 'chai';

suite('Extension Test Suite', () => {
    vscode.window.showInformationMessage('Start all tests.');

    test('Extension loads and registers commands', async () => {
        // Get all commands
        const commands = await vscode.commands.getCommands(true);
        const abapCommands = commands.filter(cmd => cmd.startsWith('abap-tools'));
        console.log('Available ABAP commands:', abapCommands);

        // Check for required commands
        const requiredCommands = [
            'abap-tools.helloWorld',
            'abap-tools.discoverAdt',
            'abap-tools.getObjectStructure'
        ];

        for (const cmd of requiredCommands) {
            assert.ok(abapCommands.includes(cmd), `Command ${cmd} not found`);
        }
    });
}); 