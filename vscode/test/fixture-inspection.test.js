'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { createClient, DEFAULT_API_BASE } = require('../lib/client');
const { workspaceClient } = require('../workspace');

const token = 'tvijo_pk_fixture-a';
const identity = { projectId: 'project-a', tenantId: 'tenant-a', executionId: 'cf-' + 'a'.repeat(48) };
const localBase = 'http://127.0.0.1:18106/api/dshrem/v1';

test('fixed fixture inspection refuses endpoint substitution and unsafe path segments before fetch', async () => {
  let requests = 0;
  const fetchImpl = async () => { requests++; throw new Error('Unexpected network'); };
  for (const base of [DEFAULT_API_BASE, 'https://other.example/api/dshrem/v1', 'http://localhost:18106/api/dshrem/v1', 'http://127.0.0.1:18106/other']) {
    const client = workspaceClient(createClient({ base, fetchImpl }), token);
    await assert.rejects(client.inspectFixedFixture(identity), { code: 'fixture_endpoint_refused' });
  }
  const client = workspaceClient(createClient({ base: localBase, fetchImpl }), token);
  await assert.rejects(client.inspectFixedFixture({ ...identity, projectId: '../other' }), { code: 'invalid_fixture_identity' });
  await assert.rejects(client.inspectFixedFixture({ ...identity, executionId: identity.executionId + '/submit' }), { code: 'invalid_fixture_identity' });
  assert.equal(requests, 0);
});

test('fixed fixture inspection refuses a generic task receipt even if its identities match', async () => {
  const api = createClient({ base: localBase, fetchImpl: async () => Response.json({
    id: identity.executionId, project_id: identity.projectId, tenant_id: identity.tenantId, status: 'completed'
  }) });
  await assert.rejects(workspaceClient(api, token).inspectFixedFixture(identity), { code: 'fixture_receipt_mismatch' });
});

const loopback = process.env.TVIJO_FIXTURE_INSPECTION_BASE;
const receiptPath = process.env.TVIJO_FIXTURE_RECEIPT_PATH;
test('Workspace client reads the exact saved Worker receipt over authenticated loopback HTTP',
  { skip: !loopback || !receiptPath }, async () => {
    const saved = JSON.parse(readFileSync(receiptPath, 'utf8'));
    const args = { projectId: saved.project_id, tenantId: saved.tenant_id, executionId: saved.id };
    const requests = [];
    const api = createClient({ base: loopback, fetchImpl: (url, options) => {
      requests.push({ url, method: options.method, redirect: options.redirect });
      return fetch(url, options);
    } });
    const receipt = await workspaceClient(api, token).inspectFixedFixture(args);
    assert.equal(receipt.source_projection_sha256, saved.projection_sha256);
    assert.equal(receipt.task_id, saved.id);
    assert.equal(receipt.status, 'completed');
    assert.equal(receipt.customer_model_workflow, 'NOT_RUN');
    await assert.rejects(workspaceClient(api, 'tvijo_pk_fixture-sibling').inspectFixedFixture(args), { status: 404 });
    const route = `${loopback}/projects/${saved.project_id}/fixture-v3/executions/${saved.id}`;
    assert.deepEqual(requests, Array.from({ length: 2 }, () => ({ url: route, method: 'GET', redirect: 'error' })));
  });
