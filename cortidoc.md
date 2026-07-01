> ## Documentation Index
> Fetch the complete documentation index at: https://docs.corti.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Overview of the Corti Agentic Framework

> AI for every healthcare app

The Corti Agentic Framework is a modular artificial intelligence system for software developers to build advanced AI agents that perform high-quality clinical and operational tasks, without having to spend months on complex architecture work.

<Tip>The AI Agent is designed to support use cases across the healthcare spectrum, from chat-based assistants for doctors to automating EHR data entry and powering clinical decision support workflows.</Tip>

## What Problems It Solves

Modern LLMs are powerful, but on their own they are insufficient and unsafe for clinical use.

The Corti Agent Platform addresses two fundamental gaps:

### 1. LLMs Do Not Have Reliable Access to Clinical Data

LLMs cannot be trusted to rely on internal knowledge alone. In healthcare, responses must be grounded in clinically validated reference sources, real-time patient and system data, and customer-owned systems and APIs. Without access to these sources at runtime, models are forced to infer or guess, which is unacceptable in clinical settings.

The Corti Agentic Framework addresses this by enabling agents to retrieve information directly from trusted external tools as part of their reasoning process. Instead of hallucinating answers, agents are designed to look things up, verify context, and base their outputs on authoritative data.

### 2. LLMs Cannot Safely Act on the World

Clinical workflows require more than generating text. They involve interacting with real systems: querying EHRs, drafting and updating documentation, preparing prescriptions, and triggering downstream processes.

The framework provides a controlled execution layer that allows agents to plan actions, invoke tools, and coordinate multi-step workflows while remaining within clearly defined safety boundaries. Where necessary, agents can pause execution, request human approval, and resume only once explicit consent is given. This ensures that automation enhances clinical workflows without bypassing governance or control.

***

## What You Can Build With It

Using the Corti Agent Platform, teams can build:

* **Clinician-facing assistants**
  * Documentation editing
  * Guideline and reference lookup
  * Coding and administrative support

* **Programmatic agent endpoints**
  * Embedded into existing clinical software
  * Triggered by events, APIs, or workflows

* **Customer-embedded agents**
  * Customers bring their own tools and systems
  * Agents combine Corti, third-party, and customer capabilities

All of these share the same underlying agent runtime, safety model, and orchestration layer.

***

## Built for Healthcare by Design

Healthcare is not a general-purpose domain, and this platform reflects that reality.

**Key design principles include:**

<Columns>
  <Card title="Safety First" icon="shield">Typed inputs and outputs, explicit tool schemas, and guardrails around action-taking ensure safe operation in clinical environments.</Card>

  <Card title="Auditability" icon="shield-check">Every decision and tool call is observable with replayable traces and structured logs for transparency, compliance, and quality assurance.</Card>

  <Card title="Domain-Specific Reasoning" icon="hand-heart">Fine-tuned reasoning layers optimized for healthcare language, workflows, and compliance needs.</Card>

  <Card title="Multi-Agent Architecture" icon="network">Corti Agentic Framework uses a state-of-the-art multi-agent architecture to enable greater scale, accuracy, and resilience in AI-driven workflows.</Card>

  <Card title="Memory and Context Management" icon="brain-circuit">Maintain persistent, context-aware conversations and manage multiple active contexts (threads) without losing information throughout the session.</Card>

  <Card title="Ecosystem of Prebuilt Experts" icon="library-big">Access a library of prebuilt Experts: specialized agents that connect to data sources, tools, and services to execute clinical and operational tasks.</Card>

  <Card title="Third-Party Integrations" icon="arrow-up-down">Plug directly into EHRs, clinical decision support systems, and medical knowledge bases with minimal setup.</Card>

  <Card title="Run-time Context" icon="person-standing">Pass relevant context with each query, including structured data formats like FHIR resources, enabling Experts to work with rich, domain-specific information.</Card>
</Columns>

***

## Who It’s For

The Corti Agent Platform is built for teams working on healthcare software.

It is intended for:

* **Healthcare software companies** embedding intelligent automation directly into their products
* **Enterprise customers** building internal, AI-powered clinical workflows
* **Advanced engineering teams** that need flexibility, control, and strong safety guarantees without building bespoke agent infrastructure from scratch

The platform is not limited to simple prompt-based chatbots. It is designed to make it easy to go from demo to **production-grade clinical AI systems** that operate safely in real-world healthcare environments.

***

## Agents vs. Workflows

Understanding the difference between agents and workflows helps you choose the right approach for your use case:

**Agents** are autonomous systems that can think, reason, and adapt to new situations. They use AI to understand context, make decisions dynamically, and take actions based on the task at hand—even when encountering scenarios they haven't seen before. Like a chef who can create a meal based on what's available, agents excel at handling unpredictable, open-ended tasks that require flexibility and judgment.

**Workflows** are structured, step-by-step processes that follow predefined paths. They execute tasks in a fixed order, like following a recipe or checklist. Workflows are ideal for repeatable processes that require consistency and compliance, such as automated approval processes or scheduled maintenance tasks.

For workflow-oriented needs, you can leverage our toolkit of other APIs to orchestrate well-defined, repeatable flows throughout your solution.

In the Corti Agentic Framework, agents leverage the Orchestrator to compose experts dynamically, adapting their approach based on the situation. Workflows, on the other hand, provide deterministic execution paths for tasks with well-defined steps and requirements—supported by our robust library of workflow APIs and integrations.

<Note>Please [contact us](https://help.corti.app/) if you need more information about the Corti Agentic Framework.</Note>


> ## Documentation Index
> Fetch the complete documentation index at: https://docs.corti.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# SDKs & Integrations

> Official SDKs and integration options for the Corti Agentic Framework

The Corti Agentic Framework provides official SDKs and supports community integrations to help you build quickly.

## Official Corti SDKs

<Columns>
  <Card title="Corti JavaScript/TypeScript SDK" icon="js">
    Official Corti Agentic SDK for Node and browser environments.<br />
    <a href="/sdk/js/overview">JavaScript SDK docs →</a>
  </Card>

  <Card title="Corti C# .NET SDK" icon="microsoft">
    Official Corti Agentic SDK for .NET applications.<br />
    <a href="/sdk/dotnet/overview">C# .NET SDK docs →</a>
  </Card>

  <Card title="Corti AI SDK Adapter" icon="plug">
    Adapter for integrating Corti A2A agents with the Vercel AI SDK. Use `useChat` and streaming patterns to build chat UIs.<br />
    <a href="/sdk/ai-sdk-adapter/overview">AI SDK Adapter docs →</a>
  </Card>
</Columns>

## Official A2A Project SDKs

<Columns>
  <Card title="Python SDK" icon="file-code">
    Build A2A-compliant agents and servers in Python.<br />
    <a href="https://github.com/a2aproject/a2a-python" target="_blank">a2a-python (Stable) →</a>
  </Card>

  <Card title="JavaScript SDK" icon="file-code">
    Official JavaScript/TypeScript SDK for A2A.<br />
    <a href="https://github.com/a2aproject/a2a-js" target="_blank">a2a-js (Stable) →</a>
  </Card>

  <Card title="Java SDK" icon="file-code">
    Build A2A-compliant agents and services in Java.<br />
    <a href="https://github.com/a2aproject/a2a-java" target="_blank">a2a-java (Stable) →</a>
  </Card>

  <Card title="Go SDK" icon="file-code">
    Implement A2A agents and servers in Go.<br />
    <a href="https://github.com/a2aproject/a2a-go" target="_blank">a2a-go (Stable) →</a>
  </Card>

  <Card title="C#/.NET SDK" icon="code">
    Build A2A-compatible agents in .NET ecosystems.<br />
    <a href="https://github.com/a2aproject/a2a-dotnet" target="_blank">a2a-dotnet (Stable) →</a>
  </Card>
</Columns>

## Other libraries

* **shadcn/ui component library for chatbots**: [`ai-elements` on npm](https://www.npmjs.com/package/ai-elements)
* **A2A Inspector**: [a2a-inspector on GitHub](https://github.com/a2aproject/a2a-inspector)
* **Awesome A2A**: [awesome-a2a on GitHub](https://github.com/ai-boost/awesome-a2a)


> ## Documentation Index
> Fetch the complete documentation index at: https://docs.corti.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# MCP Authentication

> Learn how to authenticate MCP server calls in the Agentic Framework

This document covers how to register MCP servers and how to pass authentication data in A2A message DataParts so MCP tools can be registered.

## MCP server registration

Each MCP server record includes an `authorizationType` field that controls how the Agent API authenticates when registering tools and calling that server. DataParts provide credentials at runtime but do not change the configured authorization type.

### authorizationType = none

**Meaning**: MCP server is callable without authentication.

**Behavior**: No Authorization header or OAuth flow is used. Auth DataParts for this server are ignored.

**Registration example:**

```json theme={null}
{
  "name": "medical-calculator",
  "transportType": "streamable_http",
  "authorizationType": "none",
  "url": "http://mcp-server-medical-calculator.agents:80/mcp"
}
```

### authorizationType = inherit

**Meaning**: Reuse the incoming Agent API bearer token.

**Behavior**: Uses the token from the request `Authorization` header. The API request must include a valid bearer token or the request fails with `missing_inherited_token`.

**DataPart override**: If a token DataPart is supplied for this server name, that token is used instead of the inherited token.

**Registration example:**

```json theme={null}
{
  "name": "medical-coding",
  "transportType": "streamable_http",
  "authorizationType": "inherit",
  "url": "http://mcp-server-medical-coding.agents/mcp"
}
```

### authorizationType = bearer

**Meaning**: MCP server expects a bearer token.

**Behavior**: Uses the token from a matching DataPart (type=token). If the token is missing or invalid, the MCP server typically returns 401 and the task becomes `auth-required`.

**Registration example:**

```json theme={null}
{
  "name": "medical-coding",
  "transportType": "streamable_http",
  "authorizationType": "bearer",
  "url": "http://mcp-server-medical-coding.agents/mcp"
}
```

### authorizationType = oauth2.0

**Meaning**: MCP server expects OAuth client credentials.

**Behavior**: Uses `client_id` and `client_secret` from a matching DataPart (type=credentials) and performs a client\_credentials flow. Supported for `streamable_http` transport only; `sse` is not supported.

**Registration example:**

```json theme={null}
{
  "name": "medical-coding",
  "transportType": "streamable_http",
  "authorizationType": "oauth2.0",
  "url": "http://mcp-server-medical-coding.agents/mcp"
}
```

## Authorization via message DataParts

Authentication is supplied as an A2A DataPart with `kind: "data"` and the auth payload under `data`. The following fields are used:

* `type`: `token` or `credentials` (case-insensitive)
* `mcp_name`: MCP server name as registered (case-sensitive, trimmed)
* `token`: required when `type=token`
* `client_id` and `client_secret`: required when `type=credentials`

### Token example (for authorizationType=bearer or inherit override)

```json theme={null}
{
  "kind": "data",
  "data": {
    "type": "token",
    "mcp_name": "crm-mcp",
    "token": "eyJhbGciOi..."
  }
}
```

### Credentials example (for authorizationType=oauth2.0)

```json theme={null}
{
  "kind": "data",
  "data": {
    "type": "credentials",
    "mcp_name": "crm-mcp",
    "client_id": "abc",
    "client_secret": "def"
  }
}
```

## Processing rules and errors

* `type` is normalized to lowercase; only `token` and `credentials` are extracted
* DataParts do not change the MCP server `authorizationType`—make sure the DataPart type matches the server configuration
* Unknown or invalid auth DataParts are left in the message as normal parts
* `mcp_name` must be unique per message; duplicates return `mcp_auth_duplicate_name`
* Missing fields return:
  * `mcp_auth_missing_name`
  * `mcp_auth_missing_token`
  * `mcp_auth_missing_credentials`
* If `mcp_name` does not match any configured server, the DataPart is ignored

## When DataParts are used

* MCP tools are registered when a new thread is created (the first message). Include auth DataParts on that first message
* Later messages on the same thread do not re-register tools, so auth DataParts will be ignored for MCP registration
* In the API flow, extracted auth DataParts are removed from the message before it is stored or sent to reasoning

<Tip>
  For more information about the A2A protocol and DataParts, see [A2A Protocol](/agentic/a2a-protocol).
</Tip>

<Tip>
  For general information about MCP, see [MCP Protocol](/agentic/mcp-protocol).
</Tip>

<Note>Please [contact us](https://help.corti.app/) if you need more information about the Corti Agentic Framework.</Note>
> ## Documentation Index
> Fetch the complete documentation index at: https://docs.corti.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Core Concepts

> Learn the fundamental building blocks of the Corti Agentic Framework

This page adds Corti-specific detail on top of the core A2A concepts. We have tried to adhere as closely as possible to the intended A2A protocol specification — for the canonical definition of these concepts, see the A2A documentation on [Core Concepts and Components in A2A](https://a2a-protocol.org/latest/topics/key-concepts).

The Corti Agentic Framework uses a set of core concepts that define how Corti agents, tools, and external systems interact. Understanding these building blocks is essential for developing on the Corti platform and for integrating your own systems using the A2A Protocol.

## Core Actors

At Corti, these actors typically map to concrete products and integrations:

* **User**: A clinician, contact-center agent, knowledge worker, or an automated service in your environment. The user initiates a request (for example, “summarize this consultation” or “triage this patient”) that requires assistance from one or more Corti-powered agents.
* **A2A Client (Client Agent)**: The application that calls Corti. This is your application/server. The client initiates communication using the A2A Protocol and orchestrates how results are used in your product.
* **A2A Server (Remote Agent)**: A Corti agent or agentic system that exposes an HTTP endpoint implementing the A2A Protocol. It receives requests from clients, processes tasks, and returns results or status updates.

## Fundamental Communication Elements

The following elements are fundamental to A2A communication and how Corti uses them:

<AccordionGroup>
  <Accordion title="Agent Card">
    A JSON metadata document describing an agent's identity, capabilities, endpoint, skills, and authentication requirements.

    **Key Purpose:** Enables Corti and your applications to discover agents and understand how to call them securely and effectively.
  </Accordion>

  <Accordion title="Task">
    A stateful unit of work initiated by an agent, with a unique ID and defined lifecycle.

    **Key Purpose:** Powers long‑running operations in Corti (for example, document generation or multi‑step workflows) and enables tracking and collaboration.
  </Accordion>

  <Accordion title="Message">
    A single turn of communication between a client and an agent, containing content and a role ("user" or "agent").

    **Key Purpose:** Carries instructions, clinical context, user questions, and agent responses between your application, Corti Assistant, and remote agents.
  </Accordion>

  <Accordion title="Part">
    The fundamental content container (for example, TextPart, FilePart, DataPart) used within Messages and Artifacts.

    **Key Purpose:** Lets Corti exchange text, audio transcripts, structured JSON, and files in a consistent way across agents and tools.
  </Accordion>

  <Accordion title="Artifact">
    A tangible output generated by an agent during a task (for example, a document, image, or structured data).

    **Key Purpose:** Represents concrete Corti results such as SOAP notes, call summaries, recommendations, or other structured outputs.
  </Accordion>

  <Accordion title="Context">
    A server-generated identifier (`contextId`) that logically groups multiple related `Task` objects, providing context across a series of interactions.

    **Key Purpose:** Enables you to associate multiple tasks and agents with a single patient encounter, call, or workflow, ensuring continuity and proper scoping of shared knowledge throughout an interaction.
  </Accordion>
</AccordionGroup>

## Agent Cards in Corti

The Agent Card is a JSON document that serves as a digital business card for initial discovery and interaction setup. It provides essential metadata about an agent. Clients parse this information to determine if an agent is suitable for a given task, how to structure requests, and how to communicate securely. Key information includes identity, service endpoint (URL), A2A capabilities, authentication requirements, and a list of skills.

Within Corti, Agent Cards are how you:

* Discover first‑party Corti agents and their capabilities.
* Register and describe your own remote agents so Corti workflows can call them.
* Declare authentication and compliance requirements up front, before any PHI or sensitive data is exchanged.

## Messages and Parts in Corti

A message represents a single turn of communication between a client and an agent. It includes a role ("user" or "agent") and a unique `messageId`. It contains one or more Part objects, which are granular containers for the actual content. This design allows A2A to be modality independent and lets Corti mix clinical text, transcripts, and structured data safely in a single exchange.

The primary part kinds are:

* `TextPart`: Contains plain textual content, such as instructions, questions, or generated notes.
* `DataPart`: Carries structured JSON data. This is useful for clinical facts, workflow parameters, EHR identifiers, or any machine‑readable information you exchange with Corti.
* `FilePart`: Represents a file (for example, a PDF discharge letter or an audio recording). It can be transmitted either inline (Base64 encoded) or through a URI. It includes metadata like "name" and "mimeType". This is not yet fully supported.

## Artifacts in Corti

An artifact represents a tangible output or a concrete result generated by a remote agent during task processing. Unlike general messages, artifacts are the actual deliverables. An artifact has a unique `artifactId`, a human-readable name, and consists of one or more part objects. Artifacts are closely tied to the task lifecycle and can be streamed incrementally to the client.

In Corti, artifacts typically correspond to business outputs such as:

* Clinical notes (for example, SOAP notes, discharge summaries).
* Extracted clinical facts or coding suggestions.
* Generated documents, checklists, or other workflow‑specific artifacts.

## Agent response: Task or Message

The agent response can be a new `Task` (when the agent needs to perform a long-running operation) or a `Message` (when the agent can respond immediately).

On the Corti platform this means:

* For quick operations (for example, a short completion or a classification), your agent often responds with a `Message`.
* For longer workflows (for example, generating a full clinical document, coordinating multiple tools, or waiting on downstream systems), your agent responds with a `Task` that you can monitor and later retrieve artifacts from.
> ## Documentation Index
> Fetch the complete documentation index at: https://docs.corti.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# System Architecture

> Learn about the Agentic Framework system architecture

The Corti Agentic Framework adopts a **multi-agent architecture** to power development of healthcare AI solutions. As compared to a monolithic LLM, the Corti Agentic Framework allows for improved specialization and protocol-based composition.

## Architecture Components

<Frame>
  <img src="https://mintcdn.com/corti/en_RPjQCFb1qJpbU/images/agents-main.svg?fit=max&auto=format&n=en_RPjQCFb1qJpbU&q=85&s=09b077584645b4c99b66b875e86e1974" alt="Diagram illustrating the Corti Agentic Framework architecture, showing the Orchestrator, Experts, and Memory components and how they interact." width="773" height="507" data-path="images/agents-main.svg" />
</Frame>

The architecture consists of three core components working together:

* **[Orchestrator](/agentic/orchestrator)** — The central coordinator that receives user requests and delegates tasks to specialized Experts via the A2A protocol.
* **[Experts](/agentic/experts)** — Specialized sub-agents that perform domain-specific work, potentially calling external services through MCP.
* **[Memory](/agentic/context-memory)** — Maintains persistent context and state, enabling the Orchestrator to make informed decisions and ensuring continuity across conversations.

Together, this architecture enables complex workflows through protocol-based composition while maintaining strict data isolation and stateless reasoning agents.

## Interaction mechanisms in Corti

The A2A Protocol supports various interaction patterns to accommodate different needs for responsiveness and persistence. Corti builds on these patterns so you can choose the right interaction model for your product:

* **Request/Response (Polling)**: Used for many synchronous Corti APIs where you send input and wait for a single response. For long‑running Corti tasks, your client can poll the task endpoint for status and results.
* **Streaming with Server-Sent Events (SSE)**: Used by Corti for real‑time experiences (for example, ambient notes or live guidance). Your client opens an SSE stream to receive incremental tokens, events, or status updates over an open HTTP connection.

<br />

<Note>Please [contact us](https://help.corti.app/) if you need more information about the Corti Agentic Framework.</Note>
> ## Documentation Index
> Fetch the complete documentation index at: https://docs.corti.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Orchestrator

> Learn about the Orchestration Agent at the center of the Agentic Framework

The **Orchestrator** is the central intelligence layer of the Corti Agentic Framework. It serves as the primary interface between users and the multi-agent system, coordinating the flow of conversations and tasks.

<Frame>
  <img src="https://mintcdn.com/corti/en_RPjQCFb1qJpbU/images/agent-orchestrator.svg?fit=max&auto=format&n=en_RPjQCFb1qJpbU&q=85&s=74032e26fbdcd2fc7b0c5ea48743185e" alt="Diagram showing guardrails in the agentic framework" width="773" height="507" data-path="images/agent-orchestrator.svg" />
</Frame>

## What the Orchestrator Does

The Orchestrator reasons about incoming requests and determines how to fulfill them by coordinating with specialized [Experts](/agentic/experts). Its core responsibilities include:

* **Reasoning and planning**: Analyzes user requests and determines the necessary steps to complete them
* **Expert selection**: Decides which Expert(s) to call, in what order, and with what data
* **Task decomposition**: Breaks complex requests into discrete tasks that can be handled by individual Experts
* **Response generation**: Aggregates results from Experts and typically generates the final response to the user
* **Context management**: Has full access to the [context](/agentic/context-memory), while Experts typically only have scoped access to relevant portions
* **Safety enforcement**: Enforces guardrails, type validation, and policy-driven constraints to ensure safe operation in clinical environments

The Orchestrator does not perform specialized work itself—instead, it delegates to appropriate Experts and coordinates their activities to accomplish complex workflows.

***

<Tip>
  For more information about how the Orchestrator fits into the overall architecture, see [Architecture](/agentic/architecture). To understand how context and memory work, see [Context & Memory](/agentic/context-memory).
</Tip>

<Note>Please [contact us](https://help.corti.app/) if you need more information about the Orchestrator in the Corti Agentic Framework.</Note>
> ## Documentation Index
> Fetch the complete documentation index at: https://docs.corti.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Experts

> Learn about Experts available for use with the AI Agent

An **Expert** is an LLM-powered capability that an AI agent can utilize. Experts are designed to complete small, discrete tasks efficiently, enabling the Orchestrator to compose complex workflows by chaining multiple experts together.

<Frame>
  <img src="https://mintcdn.com/corti/en_RPjQCFb1qJpbU/images/agent-experts.svg?fit=max&auto=format&n=en_RPjQCFb1qJpbU&q=85&s=4b4035f37644a1b91f564ec605946247" alt="Diagram showing where experts sit in the agentic framework flow" width="773" height="507" data-path="images/agent-experts.svg" />
</Frame>

## Expert Registry

Corti maintains a **registry of experts** that includes both first-party experts built by Corti and third-party integrations. You can browse the available experts in the [Available Experts overview](/agentic/experts/overview), or discover them programmatically through the [Expert Registry API](/agentic/agents/list-registry-experts) endpoint, which returns information about all available experts including their capabilities, descriptions, and configuration requirements.

The registry includes experts for various healthcare use cases such as:

* Clinical reference lookups
* Medical coding
* Document generation
* Data extraction
* And more

### Common registry experts

A minimal sample of frequently-used experts:

| Key                         | Purpose                                                             |
| --------------------------- | ------------------------------------------------------------------- |
| `memory-expert`             | Recall and analyze content from large in-request contexts and files |
| `coding-expert`             | Assign diagnosis and procedure codes from notes                     |
| `medical-calculator-expert` | Compute BMI, HbA1c, glucose conversions, etc.                       |
| `drugbank-expert`           | Drug information and interaction lookups                            |
| `posos-expert`              | Medication guidance and prescribing decision support                |
| `pubmed-expert`             | PubMed literature search and abstracts                              |
| `clinical-trials-expert`    | Search clinical trial registries                                    |
| `web-search-expert`         | Search and retrieve up-to-date web content                          |
| `interviewing-expert`       | Drive structured questionnaire interviews                           |

See the [Available Experts overview](/agentic/experts/overview) for the full list, including all coding-expert variants and per-expert configuration details.

## Bring Your Own Expert

You can create custom experts by exposing an MCP (Model Context Protocol) server. When you register your MCP server, Corti wraps it in a custom LLM agent with a system prompt that you can control. This allows you to:

* Integrate your own tools and data sources
* Create domain-specific experts tailored to your workflows
* Maintain control over the expert's behavior through custom system prompts
* Leverage Corti's orchestration and memory management while using your own tools

### Expert Configuration

When creating a custom expert, you provide configuration that includes:

* **Expert metadata**: ID, name, and description
* **System prompt**: Controls how the LLM agent behaves and reasons about tasks
* **MCP server configuration**: Details about your MCP server including transport type, authorization, and connection details (see [MCP Authentication](/agentic/mcp-authentication) for details)

  ```json Expert Configuration expandable theme={null}
  [
    {
      "type": "expert",
      "id": "ecg_interpreter",
      "name": "ECG Interpreter",
      "description": "Interprets 12 lead ECGs.",
      "systemPrompt": "You are an expert ECG interpreter.",
      "mcpServers": [
        {
          "id": "srv1",
          "name": "ECG API Svc",
          "transportType": "streamable_http",
          "authorizationType": "none",
          "url": "https://api.ecg.com/x"
        }
      ]
    }
  ]
  ```

### MCP Server Requirements

Your MCP server must:

* Implement the [Model Context Protocol](https://modelcontextprotocol.io/) specification
* Expose tools via the standard MCP `tools/list` and `tools/call` endpoints
* Handle authentication

Once registered, your custom expert becomes available to the Orchestrator and can be used alongside Corti's built-in experts in multi-expert workflows.

## Multi-Agent Composition

<Warning>
  This feature is coming soon.
</Warning>

We're working on exposing A2A (Agent-to-Agent) endpoints that will allow you to attach multiple agents together, enabling more sophisticated multi-agent workflows. This will provide:

* Direct agent-to-agent communication using the A2A protocol
* Composition of complex workflows across multiple agents
* Fine-grained control over agent interactions and data flow

For now, the Orchestrator handles expert composition automatically. When A2A endpoints are available, you'll be able to build custom agent networks while still leveraging Corti's orchestration capabilities.

## Direct Expert Calls

<Warning>
  This feature is coming soon.
</Warning>

We're also working on enabling direct calls to experts, allowing you to use them directly in your workflows rather than only through agents. This will provide:

* Direct API access to individual experts
* Integration of experts into custom workflows
* More flexible composition patterns beyond agent-based orchestration

<Note>
  **While AI chat is a useful mechanism, it's not the only option!**

  The Corti Agentic Framework is API-first, enabling synchronous or async usage across a range of modalities: scheduled batch jobs, clinical event triggers, UI widgets, and direct EHR system calls.

  [Let us know](https://help.corti.app) what types of use cases you're exploring, from doctor-facing chat bots to system-facing automation backends.
</Note>

<Note>Please [contact us](https://help.corti.app/) if you need more information about Experts or creating custom experts in the Corti Agentic Framework.</Note>
> ## Documentation Index
> Fetch the complete documentation index at: https://docs.corti.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Experts

> Learn about Experts available for use with the AI Agent

An **Expert** is an LLM-powered capability that an AI agent can utilize. Experts are designed to complete small, discrete tasks efficiently, enabling the Orchestrator to compose complex workflows by chaining multiple experts together.

<Frame>
  <img src="https://mintcdn.com/corti/en_RPjQCFb1qJpbU/images/agent-experts.svg?fit=max&auto=format&n=en_RPjQCFb1qJpbU&q=85&s=4b4035f37644a1b91f564ec605946247" alt="Diagram showing where experts sit in the agentic framework flow" width="773" height="507" data-path="images/agent-experts.svg" />
</Frame>

## Expert Registry

Corti maintains a **registry of experts** that includes both first-party experts built by Corti and third-party integrations. You can browse the available experts in the [Available Experts overview](/agentic/experts/overview), or discover them programmatically through the [Expert Registry API](/agentic/agents/list-registry-experts) endpoint, which returns information about all available experts including their capabilities, descriptions, and configuration requirements.

The registry includes experts for various healthcare use cases such as:

* Clinical reference lookups
* Medical coding
* Document generation
* Data extraction
* And more

### Common registry experts

A minimal sample of frequently-used experts:

| Key                         | Purpose                                                             |
| --------------------------- | ------------------------------------------------------------------- |
| `memory-expert`             | Recall and analyze content from large in-request contexts and files |
| `coding-expert`             | Assign diagnosis and procedure codes from notes                     |
| `medical-calculator-expert` | Compute BMI, HbA1c, glucose conversions, etc.                       |
| `drugbank-expert`           | Drug information and interaction lookups                            |
| `posos-expert`              | Medication guidance and prescribing decision support                |
| `pubmed-expert`             | PubMed literature search and abstracts                              |
| `clinical-trials-expert`    | Search clinical trial registries                                    |
| `web-search-expert`         | Search and retrieve up-to-date web content                          |
| `interviewing-expert`       | Drive structured questionnaire interviews                           |

See the [Available Experts overview](/agentic/experts/overview) for the full list, including all coding-expert variants and per-expert configuration details.

## Bring Your Own Expert

You can create custom experts by exposing an MCP (Model Context Protocol) server. When you register your MCP server, Corti wraps it in a custom LLM agent with a system prompt that you can control. This allows you to:

* Integrate your own tools and data sources
* Create domain-specific experts tailored to your workflows
* Maintain control over the expert's behavior through custom system prompts
* Leverage Corti's orchestration and memory management while using your own tools

### Expert Configuration

When creating a custom expert, you provide configuration that includes:

* **Expert metadata**: ID, name, and description
* **System prompt**: Controls how the LLM agent behaves and reasons about tasks
* **MCP server configuration**: Details about your MCP server including transport type, authorization, and connection details (see [MCP Authentication](/agentic/mcp-authentication) for details)

  ```json Expert Configuration expandable theme={null}
  [
    {
      "type": "expert",
      "id": "ecg_interpreter",
      "name": "ECG Interpreter",
      "description": "Interprets 12 lead ECGs.",
      "systemPrompt": "You are an expert ECG interpreter.",
      "mcpServers": [
        {
          "id": "srv1",
          "name": "ECG API Svc",
          "transportType": "streamable_http",
          "authorizationType": "none",
          "url": "https://api.ecg.com/x"
        }
      ]
    }
  ]
  ```

### MCP Server Requirements

Your MCP server must:

* Implement the [Model Context Protocol](https://modelcontextprotocol.io/) specification
* Expose tools via the standard MCP `tools/list` and `tools/call` endpoints
* Handle authentication

Once registered, your custom expert becomes available to the Orchestrator and can be used alongside Corti's built-in experts in multi-expert workflows.

## Multi-Agent Composition

<Warning>
  This feature is coming soon.
</Warning>

We're working on exposing A2A (Agent-to-Agent) endpoints that will allow you to attach multiple agents together, enabling more sophisticated multi-agent workflows. This will provide:

* Direct agent-to-agent communication using the A2A protocol
* Composition of complex workflows across multiple agents
* Fine-grained control over agent interactions and data flow

For now, the Orchestrator handles expert composition automatically. When A2A endpoints are available, you'll be able to build custom agent networks while still leveraging Corti's orchestration capabilities.

## Direct Expert Calls

<Warning>
  This feature is coming soon.
</Warning>

We're also working on enabling direct calls to experts, allowing you to use them directly in your workflows rather than only through agents. This will provide:

* Direct API access to individual experts
* Integration of experts into custom workflows
* More flexible composition patterns beyond agent-based orchestration

<Note>
  **While AI chat is a useful mechanism, it's not the only option!**

  The Corti Agentic Framework is API-first, enabling synchronous or async usage across a range of modalities: scheduled batch jobs, clinical event triggers, UI widgets, and direct EHR system calls.

  [Let us know](https://help.corti.app) what types of use cases you're exploring, from doctor-facing chat bots to system-facing automation backends.
</Note>

<Note>Please [contact us](https://help.corti.app/) if you need more information about Experts or creating custom experts in the Corti Agentic Framework.</Note>
> ## Documentation Index
> Fetch the complete documentation index at: https://docs.corti.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# A2A Protocol (Agent-to-Agent)

> Learn about the Agent-to-Agent protocol for inter-agent communication

### What is the A2A Protocol

The **Agent-to-Agent (A2A)** protocol is an open standard that enables secure, framework-agnostic communication between autonomous AI agents. Instead of building bespoke integrations whenever you want agents to collaborate, A2A gives Corti-Agentic and other systems a **common language** agents can use to discover, talk to, and delegate work to one another.

For the full technical specification, see the official A2A project docs at [a2a-protocol.org](https://a2a-protocol.org/latest/).

Originally developed by Google and now stewarded under the Linux Foundation, A2A solves a core problem in multi-agent systems: interoperability across ecosystems, languages, and vendors. It lets you connect agents built in Python, JavaScript, Java, Go, .NET, or other languages and have them cooperate on complex workflows without exposing internal agent state or proprietary logic.

### Why Corti-Agentic Uses A2A

We chose A2A because it:

* **Standardizes agent communication.** Agents can talk to each other without siloed, point-to-point integrations. That makes composite workflows easier to build and maintain.
* **Supports real workflows.** A2A includes discovery, task negotiation, and streaming updates, so agents can coordinate long-running or multi-step jobs.
* **Preserves security and opacity.** Agents exchange structured messages without sharing internal memory or tools. That protects intellectual property and keeps interactions predictable.
* **Leverages open tooling.** There are open source SDKs in multiple languages and example implementations you can reuse.

In Corti-Agentic, A2A is the backbone for agent collaboration. Whether you’re orchestrating specialist agents, chaining reasoning tasks, or integrating external agent services, A2A gives you a robust, open foundation you don’t have to reinvent.

### Open Source SDKs and Tooling

For links to Corti’s official SDK and the official A2A project SDKs (Python, JavaScript/TypeScript, Java, Go, and .NET), see **[SDKs & Integrations](/agentic/sdks-integrations)**.

<Note>Please [contact us](https://help.corti.app/) if you need more information about the Corti Agentic Framework.</Note>
