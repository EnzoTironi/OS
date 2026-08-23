/** Stable ports + URLs for the local activation profile. */
export type StackEndpoints = {
  readonly postgresUrl: string;
  readonly keycloakOrigin: string;
  readonly oidcIssuer: string;
  readonly zoendOrigin: string;
  readonly webOrigin: string;
  readonly projectName: string;
};

/** On-disk handle under e2e/activation-sample/.generated/. */
export type StackHandle = {
  readonly root: string;
  readonly generatedDir: string;
  readonly endpoints: StackEndpoints;
  readonly pidFiles: {
    readonly zoend?: string;
    readonly web?: string;
  };
  readonly policyManifestPath: string;
};

export type ComponentName =
  | "postgres"
  | "keycloak"
  | "zoend"
  | "web"
  | "sample-seed";

export type ComponentHealth =
  | { readonly name: ComponentName; readonly state: "ready"; readonly detail?: string }
  | {
      readonly name: ComponentName;
      readonly state: "starting";
      readonly detail?: string;
    }
  | {
      readonly name: ComponentName;
      readonly state: "unhealthy";
      readonly detail: string;
    }
  | { readonly name: ComponentName; readonly state: "absent"; readonly detail?: string };

export type StackStatus =
  | {
      readonly kind: "Ready";
      readonly components: readonly ComponentHealth[];
      readonly endpoints: StackEndpoints;
      readonly sample?: SampleCompanyRef;
    }
  | {
      readonly kind: "Degraded";
      readonly components: readonly ComponentHealth[];
      readonly endpoints?: StackEndpoints;
      readonly sample?: SampleCompanyRef;
    }
  | {
      readonly kind: "Stopped";
      readonly components: readonly ComponentHealth[];
    };

export type SeedMode = "ensure" | "reset";

export type SampleCompanyRef = {
  readonly tenantId: string;
  readonly organizationId: string;
  readonly orderLineId: string;
  readonly stockPositionId: string;
  readonly purchaseLineId: string;
  readonly definitionId: string;
  readonly definitionDigest: string;
  readonly activatedRevision: string;
  readonly commitmentOperationId: string;
  readonly webBindings: {
    readonly definitionId: string;
    readonly resourceId: string;
    readonly validAt: string;
    readonly oidcClientId: string;
    readonly oidcIssuer: string;
  };
};

export type SeedResult =
  | { readonly outcome: "already-seeded"; readonly sample: SampleCompanyRef }
  | { readonly outcome: "seeded"; readonly sample: SampleCompanyRef }
  | { readonly outcome: "reset-and-seeded"; readonly sample: SampleCompanyRef };

export type TimingPhase = {
  readonly name: string;
  readonly ms: number;
};

export type TimingReport = {
  readonly wallMs: number;
  readonly phases: readonly TimingPhase[];
  readonly budgetMs: number;
  readonly withinBudget: boolean;
};

export type DoctorReport = {
  readonly status: StackStatus;
  readonly blockers: readonly string[];
  readonly hints: readonly string[];
  readonly timing?: TimingReport;
  readonly mutantGuards: {
    readonly readinessRequiresAllReady: true;
    readonly noSleepAsSuccess: true;
    readonly sampleUsesOidcNotZoenAccount: true;
  };
};

export const ACTIVATION_BUDGET_MS = 300_000;
export const SCENARIO = "activation-sample";
export const COMPOSE_PROJECT = "zoen-activation-sample";
