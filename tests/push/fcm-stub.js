/**
 * TEST ONLY – never load this in production.
 *
 * Loaded by the local test run of tests/push/push.test.js through NODE_OPTIONS=--require.
 * Replaces the connection to Firebase: every message utils/push.js would send is appended to
 * tests/push/sent.jsonl instead, and tokens containing "dead" are answered like FCM answers an
 * uninstalled app (404 UNREGISTERED). Everything before it – channel, settings, tokens – runs
 * unchanged.
 */
const fs = require('fs');
const path = require('path');
const { GoogleAuth } = require('google-auth-library');

const LOG = path.join(__dirname, 'sent.jsonl');

GoogleAuth.prototype.getClient = async function () {
    return {
        request: async ({ url, data }) => {
            const token = data.message.fid;
            if (token.includes('dead')) {
                const err = new Error('Requested entity was not found.');
                err.response = { status: 404, data: { error: { message: 'Requested entity was not found.', details: [{ errorCode: 'UNREGISTERED' }] } } };
                throw err;
            }
            fs.appendFileSync(LOG, JSON.stringify({ url, message: data.message }) + '\n');
            return { status: 200, data: { name: 'projects/test/messages/1' } };
        },
    };
};

console.warn('[TEST] FCM stub active – push messages go to tests/push/sent.jsonl. Never use this in production.');
