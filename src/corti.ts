import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { CortiAuth, CortiClient } from '@corti/sdk';
import { loadConfig } from './config';

interface AgentState {
  agentId: string;
  agentName: string;
  createdAt: string;
  createdVia?: string;
  consoleUrl?: string;
}

export interface SendMessageResult {
  text: string;
  contextId: string;
  credits: number;
}

export class CortiClientWrapper {
  private client: CortiClient | null = null;
  private auth: CortiAuth;
  private agentId: string | null = null;
  private readonly config = loadConfig();

  constructor() {
    const env = process.env.CORTI_ENVIRONMENT ?? 'eu';
    const tenant = process.env.CORTI_TENANT_NAME ?? 'base';

    if (!process.env.CORTI_CLIENT_ID || !process.env.CORTI_CLIENT_SECRET) {
      throw new Error('CORTI_CLIENT_ID and CORTI_CLIENT_SECRET must be set in .env.local');
    }

    this.auth = new CortiAuth({ environment: env, tenantName: tenant });
  }

  private async getClient(): Promise<CortiClient> {
    if (this.client) return this.client;

    const { accessToken } = await this.auth.getToken({
      clientId: process.env.CORTI_CLIENT_ID!,
      clientSecret: process.env.CORTI_CLIENT_SECRET!,
    });

    this.client = new CortiClient({ auth: { accessToken } });
    return this.client;
  }

  async getOrCreateAgent(): Promise<string> {
    if (this.agentId) return this.agentId;

    const stateFile = path.resolve(process.cwd(), this.config.corti.agentStateFile);
    const client = await this.getClient();

    if (this.config.corti.reuseAgent && fs.existsSync(stateFile)) {
      const state = JSON.parse(fs.readFileSync(stateFile, 'utf-8')) as AgentState;
      try {
        await client.agents.get(state.agentId);
        console.log(`[corti] Reusing existing agent: ${state.agentId} (${state.agentName})`);
        if (state.consoleUrl) console.log(`[corti] Console: ${state.consoleUrl}`);
        this.agentId = state.agentId;
        return this.agentId;
      } catch {
        console.log('[corti] Saved agent not found, creating new one...');
      }
    }

    const agent = await client.agents.create({
      name: this.config.corti.agentName,
      description: this.config.corti.agentDescription,
      experts: this.config.corti.experts as never,
    });

    this.agentId = agent.id;
    const consoleUrl = `https://console.corti.app/project/8a9184e2-d7ba-4eda-b52b-ca225e265376/ai-studio/agents/${agent.id}`;
    console.log(`[corti] Created new agent: ${agent.id} (${agent.name})`);

    const state: AgentState = {
      agentId: agent.id,
      agentName: agent.name,
      createdAt: new Date().toISOString(),
      createdVia: 'api',
      consoleUrl,
    };
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
    return this.agentId;
  }

  async sendMessage(text: string, contextId?: string): Promise<SendMessageResult> {
    const client = await this.getClient();
    const agentId = await this.getOrCreateAgent();
    const messageId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const result = await client.agents.messageSend(
      agentId,
      {
        message: {
          role: 'user',
          parts: [{ kind: 'text', text }],
          messageId,
          kind: 'message',
          ...(contextId ? { contextId } : {}),
        } as never,
      }
    );

    const task = result.task as {
      contextId: string;
      status: { message: { parts: Array<{ text: string }> } };
      metadata?: { credits: number };
    };

    const responseText = task.status.message.parts.map((p) => p.text).join('\n');
    return {
      text: responseText,
      contextId: task.contextId,
      credits: task.metadata?.credits ?? 0,
    };
  }

  async listAgents() {
    const client = await this.getClient();
    return client.agents.list();
  }

  async deleteAgent(agentId: string) {
    const client = await this.getClient();
    return client.agents.delete(agentId);
  }

  getAgentId(): string | null {
    return this.agentId;
  }
}

// Smoke test — run directly: npx ts-node src/corti.ts
if (require.main === module) {
  (async () => {
    console.log('=== Corti Client Smoke Test (official SDK) ===\n');
    const corti = new CortiClientWrapper();

    console.log('1. Authenticating with CortiAuth...');
    await corti.getOrCreateAgent();
    console.log('   Auth OK\n');

    console.log('2. Getting/creating agent...');
    const agentId = await corti.getOrCreateAgent();
    console.log(`   Agent ID: ${agentId}  OK\n`);

    console.log('3. Sending test message...');
    const r1 = await corti.sendMessage('You are a de-identification assistant. Reply with: READY');
    console.log(`   Response : ${r1.text.slice(0, 100)}`);
    console.log(`   ContextID: ${r1.contextId}`);
    console.log(`   Credits  : ${r1.credits}\n`);

    console.log('4. Multi-turn follow-up (same context)...');
    const r2 = await corti.sendMessage('What is your role?', r1.contextId);
    console.log(`   Response : ${r2.text.slice(0, 100)}\n`);

    console.log('5. Agent reuse (second instance)...');
    const corti2 = new CortiClientWrapper();
    const agentId2 = await corti2.getOrCreateAgent();
    console.log(`   Same agent: ${agentId === agentId2 ? 'YES ✓' : 'NO ✗'}\n`);

    console.log('=== Smoke test PASSED ===\n');
    console.log('Agent details:');
    console.log(`  ID     : ${agentId}`);
    console.log(`  Tenant : ${process.env.CORTI_TENANT_NAME}`);
    console.log(`  Region : ${process.env.CORTI_ENVIRONMENT}`);
    console.log(`  SDK    : @corti/sdk v3.1.0`);
  })().catch((err) => {
    console.error('\nSmoke test FAILED:', (err as Error).message);
    process.exit(1);
  });
}
