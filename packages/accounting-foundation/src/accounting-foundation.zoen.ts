import {
  defineAction,
  defineBundle,
  defineComputation,
  defineRelation,
  defineType,
} from "@zoen/ontology";

const Book = defineType({
  attributes: [{ id: "bookId", valueType: { kind: "text" } }],
  id: "accounting.Book",
});

const Ledger = defineType({
  attributes: [{ id: "ledgerId", valueType: { kind: "text" } }],
  id: "accounting.Ledger",
});

const Account = defineType({
  attributes: [{ id: "accountId", valueType: { kind: "text" } }],
  id: "accounting.Account",
});

const EconomicClaim = defineType({
  attributes: [{ id: "claimId", valueType: { kind: "text" } }],
  id: "accounting.EconomicClaim",
});

const Posting = defineType({
  attributes: [{ id: "postingId", valueType: { kind: "text" } }],
  id: "accounting.Posting",
});

const Settlement = defineType({
  attributes: [{ id: "settlementId", valueType: { kind: "text" } }],
  id: "accounting.Settlement",
});

const bookCode = defineRelation({
  cardinality: "one",
  id: "accounting.bookCode",
  sourceType: "accounting.Book",
  target: { kind: "value", valueType: { kind: "text" } },
});

const functionalCurrency = defineRelation({
  cardinality: "one",
  id: "accounting.functionalCurrency",
  sourceType: "accounting.Book",
  target: { kind: "value", valueType: { kind: "text" } },
});

const historicalBookMeaning = defineRelation({
  cardinality: "many",
  id: "accounting.historicalBookMeaning",
  sourceType: "accounting.Book",
  target: { kind: "value", valueType: { kind: "text" } },
});

const ledgerCode = defineRelation({
  cardinality: "one",
  id: "accounting.ledgerCode",
  sourceType: "accounting.Ledger",
  target: { kind: "value", valueType: { kind: "text" } },
});

const ledgerBookReference = defineRelation({
  cardinality: "one",
  id: "accounting.ledgerBookReference",
  sourceType: "accounting.Ledger",
  target: { kind: "value", valueType: { kind: "text" } },
});

const accountCode = defineRelation({
  cardinality: "one",
  id: "accounting.accountCode",
  sourceType: "accounting.Account",
  target: { kind: "value", valueType: { kind: "text" } },
});

const accountClassification = defineRelation({
  cardinality: "one",
  id: "accounting.accountClassification",
  sourceType: "accounting.Account",
  target: { kind: "value", valueType: { kind: "text" } },
});

const accountName = defineRelation({
  cardinality: "one",
  id: "accounting.accountName",
  sourceType: "accounting.Account",
  target: { kind: "value", valueType: { kind: "text" } },
});

const bookReference = defineRelation({
  cardinality: "one",
  id: "accounting.bookReference",
  sourceType: "accounting.EconomicClaim",
  target: { kind: "value", valueType: { kind: "text" } },
});

const ledgerReference = defineRelation({
  cardinality: "one",
  id: "accounting.ledgerReference",
  sourceType: "accounting.EconomicClaim",
  target: { kind: "value", valueType: { kind: "text" } },
});

const claimReference = defineRelation({
  cardinality: "one",
  id: "accounting.claimReference",
  sourceType: "accounting.EconomicClaim",
  target: { kind: "value", valueType: { kind: "text" } },
});

const claimKind = defineRelation({
  cardinality: "one",
  id: "accounting.claimKind",
  sourceType: "accounting.EconomicClaim",
  target: { kind: "value", valueType: { kind: "text" } },
});

const counterpartyReference = defineRelation({
  cardinality: "one",
  id: "accounting.counterpartyReference",
  sourceType: "accounting.EconomicClaim",
  target: { kind: "value", valueType: { kind: "text" } },
});

const claimCurrency = defineRelation({
  cardinality: "one",
  id: "accounting.claimCurrency",
  sourceType: "accounting.EconomicClaim",
  target: { kind: "value", valueType: { kind: "text" } },
});

const originalAmount = defineRelation({
  cardinality: "one",
  id: "accounting.originalAmount",
  sourceType: "accounting.EconomicClaim",
  target: { kind: "value", valueType: { kind: "decimal" } },
});

const appliedAmount = defineRelation({
  cardinality: "one",
  id: "accounting.appliedAmount",
  sourceType: "accounting.EconomicClaim",
  target: { kind: "value", valueType: { kind: "decimal" } },
});

const postingReference = defineRelation({
  cardinality: "many",
  id: "accounting.postingReference",
  sourceType: "accounting.EconomicClaim",
  target: { kind: "value", valueType: { kind: "text" } },
});

const postingDate = defineRelation({
  cardinality: "many",
  id: "accounting.postingDate",
  sourceType: "accounting.EconomicClaim",
  target: { kind: "value", valueType: { kind: "text" } },
});

const eventDate = defineRelation({
  cardinality: "many",
  id: "accounting.eventDate",
  sourceType: "accounting.EconomicClaim",
  target: { kind: "value", valueType: { kind: "text" } },
});

const debitAccountReference = defineRelation({
  cardinality: "many",
  id: "accounting.debitAccountReference",
  sourceType: "accounting.EconomicClaim",
  target: { kind: "value", valueType: { kind: "text" } },
});

const creditAccountReference = defineRelation({
  cardinality: "many",
  id: "accounting.creditAccountReference",
  sourceType: "accounting.EconomicClaim",
  target: { kind: "value", valueType: { kind: "text" } },
});

const debitAmount = defineRelation({
  cardinality: "many",
  id: "accounting.debitAmount",
  sourceType: "accounting.EconomicClaim",
  target: { kind: "value", valueType: { kind: "decimal" } },
});

const creditAmount = defineRelation({
  cardinality: "many",
  id: "accounting.creditAmount",
  sourceType: "accounting.EconomicClaim",
  target: { kind: "value", valueType: { kind: "decimal" } },
});

const postedDebitTotal = defineRelation({
  cardinality: "one",
  id: "accounting.postedDebitTotal",
  sourceType: "accounting.EconomicClaim",
  target: { kind: "value", valueType: { kind: "decimal" } },
});

const postedCreditTotal = defineRelation({
  cardinality: "one",
  id: "accounting.postedCreditTotal",
  sourceType: "accounting.EconomicClaim",
  target: { kind: "value", valueType: { kind: "decimal" } },
});

const originatingOperationReference = defineRelation({
  cardinality: "many",
  id: "accounting.originatingOperationReference",
  sourceType: "accounting.EconomicClaim",
  target: { kind: "value", valueType: { kind: "text" } },
});

const fulfillmentOperationReference = defineRelation({
  cardinality: "many",
  id: "accounting.fulfillmentOperationReference",
  sourceType: "accounting.EconomicClaim",
  target: { kind: "value", valueType: { kind: "text" } },
});

const manufacturingOccurrenceReference = defineRelation({
  cardinality: "many",
  id: "accounting.manufacturingOccurrenceReference",
  sourceType: "accounting.EconomicClaim",
  target: { kind: "value", valueType: { kind: "text" } },
});

const settlementReference = defineRelation({
  cardinality: "many",
  id: "accounting.settlementReference",
  sourceType: "accounting.EconomicClaim",
  target: { kind: "value", valueType: { kind: "text" } },
});

const settlementAmount = defineRelation({
  cardinality: "many",
  id: "accounting.settlementAmount",
  sourceType: "accounting.EconomicClaim",
  target: { kind: "value", valueType: { kind: "decimal" } },
});

const settlementCurrency = defineRelation({
  cardinality: "many",
  id: "accounting.settlementCurrency",
  sourceType: "accounting.EconomicClaim",
  target: { kind: "value", valueType: { kind: "text" } },
});

const settlementOperationReference = defineRelation({
  cardinality: "many",
  id: "accounting.settlementOperationReference",
  sourceType: "accounting.EconomicClaim",
  target: { kind: "value", valueType: { kind: "text" } },
});

const paymentDate = defineRelation({
  cardinality: "many",
  id: "accounting.paymentDate",
  sourceType: "accounting.EconomicClaim",
  target: { kind: "value", valueType: { kind: "text" } },
});

const reversalPostingReference = defineRelation({
  cardinality: "many",
  id: "accounting.reversalPostingReference",
  sourceType: "accounting.EconomicClaim",
  target: { kind: "value", valueType: { kind: "text" } },
});

const reversalOf = defineRelation({
  cardinality: "many",
  id: "accounting.reversalOf",
  sourceType: "accounting.EconomicClaim",
  target: { kind: "value", valueType: { kind: "text" } },
});

const correctionPostingReference = defineRelation({
  cardinality: "many",
  id: "accounting.correctionPostingReference",
  sourceType: "accounting.EconomicClaim",
  target: { kind: "value", valueType: { kind: "text" } },
});

const correctionOf = defineRelation({
  cardinality: "many",
  id: "accounting.correctionOf",
  sourceType: "accounting.EconomicClaim",
  target: { kind: "value", valueType: { kind: "text" } },
});

const correctionReason = defineRelation({
  cardinality: "many",
  id: "accounting.correctionReason",
  sourceType: "accounting.EconomicClaim",
  target: { kind: "value", valueType: { kind: "text" } },
});

const remainingClaim = defineComputation({
  expression: {
    kind: "binary",
    left: {
      kind: "relation",
      relationId: "accounting.originalAmount",
    },
    operator: "subtract",
    right: {
      kind: "relation",
      relationId: "accounting.appliedAmount",
    },
  },
  id: "accounting.remainingClaim",
  inputs: [],
  returns: { kind: "decimal" },
});

const postingDifference = defineComputation({
  expression: {
    kind: "binary",
    left: {
      kind: "relation",
      relationId: "accounting.postedDebitTotal",
    },
    operator: "subtract",
    right: {
      kind: "relation",
      relationId: "accounting.postedCreditTotal",
    },
  },
  id: "accounting.postingDifference",
  inputs: [],
  returns: { kind: "decimal" },
});

const recordBookIdentity = defineAction({
  effects: [
    {
      relationId: "accounting.bookCode",
      value: { inputId: "code", kind: "input" },
    },
    {
      relationId: "accounting.functionalCurrency",
      value: { inputId: "currency", kind: "input" },
    },
    {
      relationId: "accounting.historicalBookMeaning",
      value: { inputId: "meaning", kind: "input" },
    },
  ],
  id: "accounting.recordBookIdentity",
  inputs: [
    { id: "code", valueType: { kind: "text" } },
    { id: "currency", valueType: { kind: "text" } },
    { id: "meaning", valueType: { kind: "text" } },
    { id: "revision", valueType: { kind: "integer" } },
  ],
  precondition: {
    kind: "binary",
    left: { inputId: "revision", kind: "input" },
    operator: "greater_than",
    right: {
      kind: "literal",
      value: { kind: "integer", value: "0" },
    },
  },
});

const recordLedgerIdentity = defineAction({
  effects: [
    {
      relationId: "accounting.ledgerBookReference",
      value: { inputId: "bookReference", kind: "input" },
    },
    {
      relationId: "accounting.ledgerCode",
      value: { inputId: "code", kind: "input" },
    },
  ],
  id: "accounting.recordLedgerIdentity",
  inputs: [
    { id: "bookReference", valueType: { kind: "text" } },
    { id: "code", valueType: { kind: "text" } },
    { id: "revision", valueType: { kind: "integer" } },
  ],
  precondition: {
    kind: "binary",
    left: { inputId: "revision", kind: "input" },
    operator: "greater_than",
    right: {
      kind: "literal",
      value: { kind: "integer", value: "0" },
    },
  },
});

const recordAccountIdentity = defineAction({
  effects: [
    {
      relationId: "accounting.accountClassification",
      value: { inputId: "classification", kind: "input" },
    },
    {
      relationId: "accounting.accountCode",
      value: { inputId: "code", kind: "input" },
    },
    {
      relationId: "accounting.accountName",
      value: { inputId: "name", kind: "input" },
    },
  ],
  id: "accounting.recordAccountIdentity",
  inputs: [
    { id: "classification", valueType: { kind: "text" } },
    { id: "code", valueType: { kind: "text" } },
    { id: "name", valueType: { kind: "text" } },
    { id: "revision", valueType: { kind: "integer" } },
  ],
  precondition: {
    kind: "binary",
    left: { inputId: "revision", kind: "input" },
    operator: "greater_than",
    right: {
      kind: "literal",
      value: { kind: "integer", value: "0" },
    },
  },
});

const postReceivable = defineAction({
  effects: [
    {
      relationId: "accounting.appliedAmount",
      value: {
        kind: "literal",
        value: { kind: "decimal", value: "0" },
      },
    },
    {
      relationId: "accounting.bookReference",
      value: { inputId: "bookReference", kind: "input" },
    },
    {
      relationId: "accounting.claimCurrency",
      value: { inputId: "currency", kind: "input" },
    },
    {
      relationId: "accounting.claimKind",
      value: {
        kind: "literal",
        value: { kind: "text", value: "receivable" },
      },
    },
    {
      relationId: "accounting.claimReference",
      value: { inputId: "claimReference", kind: "input" },
    },
    {
      relationId: "accounting.counterpartyReference",
      value: { inputId: "counterpartyReference", kind: "input" },
    },
    {
      relationId: "accounting.creditAccountReference",
      value: { inputId: "creditAccountReference", kind: "input" },
    },
    {
      relationId: "accounting.creditAmount",
      value: { inputId: "creditAmount", kind: "input" },
    },
    {
      relationId: "accounting.debitAccountReference",
      value: { inputId: "debitAccountReference", kind: "input" },
    },
    {
      relationId: "accounting.debitAmount",
      value: { inputId: "debitAmount", kind: "input" },
    },
    {
      relationId: "accounting.eventDate",
      value: { inputId: "eventDate", kind: "input" },
    },
    {
      relationId: "accounting.fulfillmentOperationReference",
      value: { inputId: "fulfillmentOperationReference", kind: "input" },
    },
    {
      relationId: "accounting.ledgerReference",
      value: { inputId: "ledgerReference", kind: "input" },
    },
    {
      relationId: "accounting.manufacturingOccurrenceReference",
      value: { inputId: "manufacturingOccurrenceReference", kind: "input" },
    },
    {
      relationId: "accounting.originalAmount",
      value: { inputId: "debitAmount", kind: "input" },
    },
    {
      relationId: "accounting.originatingOperationReference",
      value: { inputId: "originatingOperationReference", kind: "input" },
    },
    {
      relationId: "accounting.postedCreditTotal",
      value: { inputId: "creditAmount", kind: "input" },
    },
    {
      relationId: "accounting.postedDebitTotal",
      value: { inputId: "debitAmount", kind: "input" },
    },
    {
      relationId: "accounting.postingDate",
      value: { inputId: "postingDate", kind: "input" },
    },
    {
      relationId: "accounting.postingReference",
      value: { inputId: "postingReference", kind: "input" },
    },
  ],
  id: "accounting.postReceivable",
  inputs: [
    { id: "bookReference", valueType: { kind: "text" } },
    { id: "claimReference", valueType: { kind: "text" } },
    { id: "counterpartyReference", valueType: { kind: "text" } },
    { id: "creditAccountReference", valueType: { kind: "text" } },
    { id: "creditAmount", valueType: { kind: "decimal" } },
    { id: "currency", valueType: { kind: "text" } },
    { id: "debitAccountReference", valueType: { kind: "text" } },
    { id: "debitAmount", valueType: { kind: "decimal" } },
    { id: "eventDate", valueType: { kind: "text" } },
    { id: "fulfillmentOperationReference", valueType: { kind: "text" } },
    { id: "ledgerReference", valueType: { kind: "text" } },
    {
      id: "manufacturingOccurrenceReference",
      valueType: { kind: "text" },
    },
    { id: "originatingOperationReference", valueType: { kind: "text" } },
    { id: "postingDate", valueType: { kind: "text" } },
    { id: "postingReference", valueType: { kind: "text" } },
  ],
  precondition: {
    kind: "binary",
    left: { inputId: "debitAmount", kind: "input" },
    operator: "greater_than",
    right: {
      kind: "literal",
      value: { kind: "decimal", value: "0" },
    },
  },
});

const postPayable = defineAction({
  effects: [
    {
      relationId: "accounting.appliedAmount",
      value: {
        kind: "literal",
        value: { kind: "decimal", value: "0" },
      },
    },
    {
      relationId: "accounting.bookReference",
      value: { inputId: "bookReference", kind: "input" },
    },
    {
      relationId: "accounting.claimCurrency",
      value: { inputId: "currency", kind: "input" },
    },
    {
      relationId: "accounting.claimKind",
      value: {
        kind: "literal",
        value: { kind: "text", value: "payable" },
      },
    },
    {
      relationId: "accounting.claimReference",
      value: { inputId: "claimReference", kind: "input" },
    },
    {
      relationId: "accounting.counterpartyReference",
      value: { inputId: "counterpartyReference", kind: "input" },
    },
    {
      relationId: "accounting.creditAccountReference",
      value: { inputId: "creditAccountReference", kind: "input" },
    },
    {
      relationId: "accounting.creditAmount",
      value: { inputId: "creditAmount", kind: "input" },
    },
    {
      relationId: "accounting.debitAccountReference",
      value: { inputId: "debitAccountReference", kind: "input" },
    },
    {
      relationId: "accounting.debitAmount",
      value: { inputId: "debitAmount", kind: "input" },
    },
    {
      relationId: "accounting.eventDate",
      value: { inputId: "eventDate", kind: "input" },
    },
    {
      relationId: "accounting.ledgerReference",
      value: { inputId: "ledgerReference", kind: "input" },
    },
    {
      relationId: "accounting.originalAmount",
      value: { inputId: "debitAmount", kind: "input" },
    },
    {
      relationId: "accounting.originatingOperationReference",
      value: { inputId: "originatingOperationReference", kind: "input" },
    },
    {
      relationId: "accounting.postedCreditTotal",
      value: { inputId: "creditAmount", kind: "input" },
    },
    {
      relationId: "accounting.postedDebitTotal",
      value: { inputId: "debitAmount", kind: "input" },
    },
    {
      relationId: "accounting.postingDate",
      value: { inputId: "postingDate", kind: "input" },
    },
    {
      relationId: "accounting.postingReference",
      value: { inputId: "postingReference", kind: "input" },
    },
  ],
  id: "accounting.postPayable",
  inputs: [
    { id: "bookReference", valueType: { kind: "text" } },
    { id: "claimReference", valueType: { kind: "text" } },
    { id: "counterpartyReference", valueType: { kind: "text" } },
    { id: "creditAccountReference", valueType: { kind: "text" } },
    { id: "creditAmount", valueType: { kind: "decimal" } },
    { id: "currency", valueType: { kind: "text" } },
    { id: "debitAccountReference", valueType: { kind: "text" } },
    { id: "debitAmount", valueType: { kind: "decimal" } },
    { id: "eventDate", valueType: { kind: "text" } },
    { id: "ledgerReference", valueType: { kind: "text" } },
    { id: "originatingOperationReference", valueType: { kind: "text" } },
    { id: "postingDate", valueType: { kind: "text" } },
    { id: "postingReference", valueType: { kind: "text" } },
  ],
  precondition: {
    kind: "binary",
    left: { inputId: "debitAmount", kind: "input" },
    operator: "greater_than",
    right: {
      kind: "literal",
      value: { kind: "decimal", value: "0" },
    },
  },
});

const applySettlement = defineAction({
  effects: [
    {
      relationId: "accounting.appliedAmount",
      value: {
        kind: "binary",
        left: {
          kind: "relation",
          relationId: "accounting.appliedAmount",
        },
        operator: "add",
        right: { inputId: "amount", kind: "input" },
      },
    },
    {
      relationId: "accounting.paymentDate",
      value: { inputId: "paymentDate", kind: "input" },
    },
    {
      relationId: "accounting.settlementAmount",
      value: { inputId: "amount", kind: "input" },
    },
    {
      relationId: "accounting.settlementCurrency",
      value: { inputId: "currency", kind: "input" },
    },
    {
      relationId: "accounting.settlementOperationReference",
      value: { inputId: "operationReference", kind: "input" },
    },
    {
      relationId: "accounting.settlementReference",
      value: { inputId: "settlementReference", kind: "input" },
    },
  ],
  id: "accounting.applySettlement",
  inputs: [
    { id: "amount", valueType: { kind: "decimal" } },
    { id: "currency", valueType: { kind: "text" } },
    { id: "operationReference", valueType: { kind: "text" } },
    { id: "paymentDate", valueType: { kind: "text" } },
    { id: "settlementReference", valueType: { kind: "text" } },
  ],
  precondition: {
    kind: "binary",
    left: {
      kind: "binary",
      left: {
        kind: "relation",
        relationId: "accounting.originalAmount",
      },
      operator: "subtract",
      right: {
        kind: "relation",
        relationId: "accounting.appliedAmount",
      },
    },
    operator: "greater_than",
    right: { inputId: "amount", kind: "input" },
  },
});

const reversePosting = defineAction({
  effects: [
    {
      relationId: "accounting.creditAccountReference",
      value: { inputId: "creditAccountReference", kind: "input" },
    },
    {
      relationId: "accounting.creditAmount",
      value: {
        kind: "relation",
        relationId: "accounting.originalAmount",
      },
    },
    {
      relationId: "accounting.debitAccountReference",
      value: { inputId: "debitAccountReference", kind: "input" },
    },
    {
      relationId: "accounting.debitAmount",
      value: {
        kind: "relation",
        relationId: "accounting.originalAmount",
      },
    },
    {
      relationId: "accounting.eventDate",
      value: { inputId: "eventDate", kind: "input" },
    },
    {
      relationId: "accounting.originatingOperationReference",
      value: { inputId: "originatingOperationReference", kind: "input" },
    },
    {
      relationId: "accounting.postedCreditTotal",
      value: {
        kind: "binary",
        left: {
          kind: "relation",
          relationId: "accounting.postedCreditTotal",
        },
        operator: "add",
        right: {
          kind: "relation",
          relationId: "accounting.originalAmount",
        },
      },
    },
    {
      relationId: "accounting.postedDebitTotal",
      value: {
        kind: "binary",
        left: {
          kind: "relation",
          relationId: "accounting.postedDebitTotal",
        },
        operator: "add",
        right: {
          kind: "relation",
          relationId: "accounting.originalAmount",
        },
      },
    },
    {
      relationId: "accounting.postingDate",
      value: { inputId: "postingDate", kind: "input" },
    },
    {
      relationId: "accounting.reversalOf",
      value: { inputId: "reversalOf", kind: "input" },
    },
    {
      relationId: "accounting.reversalPostingReference",
      value: { inputId: "postingReference", kind: "input" },
    },
  ],
  id: "accounting.reversePosting",
  inputs: [
    { id: "creditAccountReference", valueType: { kind: "text" } },
    { id: "debitAccountReference", valueType: { kind: "text" } },
    { id: "eventDate", valueType: { kind: "text" } },
    { id: "originatingOperationReference", valueType: { kind: "text" } },
    { id: "postingDate", valueType: { kind: "text" } },
    { id: "postingReference", valueType: { kind: "text" } },
    { id: "reversalOf", valueType: { kind: "text" } },
  ],
  precondition: {
    kind: "binary",
    left: {
      kind: "binary",
      left: {
        kind: "relation",
        relationId: "accounting.originalAmount",
      },
      operator: "add",
      right: {
        kind: "binary",
        left: {
          kind: "relation",
          relationId: "accounting.postedDebitTotal",
        },
        operator: "add",
        right: {
          kind: "relation",
          relationId: "accounting.postedCreditTotal",
        },
      },
    },
    operator: "greater_than",
    right: {
      kind: "binary",
      left: {
        kind: "relation",
        relationId: "accounting.postedDebitTotal",
      },
      operator: "add",
      right: {
        kind: "relation",
        relationId: "accounting.postedCreditTotal",
      },
    },
  },
});

const correctPosting = defineAction({
  effects: [
    {
      relationId: "accounting.correctionOf",
      value: { inputId: "correctionOf", kind: "input" },
    },
    {
      relationId: "accounting.correctionPostingReference",
      value: { inputId: "postingReference", kind: "input" },
    },
    {
      relationId: "accounting.correctionReason",
      value: { inputId: "reason", kind: "input" },
    },
    {
      relationId: "accounting.creditAccountReference",
      value: { inputId: "creditAccountReference", kind: "input" },
    },
    {
      relationId: "accounting.creditAmount",
      value: {
        kind: "relation",
        relationId: "accounting.originalAmount",
      },
    },
    {
      relationId: "accounting.debitAccountReference",
      value: { inputId: "debitAccountReference", kind: "input" },
    },
    {
      relationId: "accounting.debitAmount",
      value: {
        kind: "relation",
        relationId: "accounting.originalAmount",
      },
    },
    {
      relationId: "accounting.originatingOperationReference",
      value: { inputId: "originatingOperationReference", kind: "input" },
    },
    {
      relationId: "accounting.postedCreditTotal",
      value: {
        kind: "binary",
        left: {
          kind: "relation",
          relationId: "accounting.postedCreditTotal",
        },
        operator: "add",
        right: {
          kind: "relation",
          relationId: "accounting.originalAmount",
        },
      },
    },
    {
      relationId: "accounting.postedDebitTotal",
      value: {
        kind: "binary",
        left: {
          kind: "relation",
          relationId: "accounting.postedDebitTotal",
        },
        operator: "add",
        right: {
          kind: "relation",
          relationId: "accounting.originalAmount",
        },
      },
    },
    {
      relationId: "accounting.postingDate",
      value: { inputId: "postingDate", kind: "input" },
    },
  ],
  id: "accounting.correctPosting",
  inputs: [
    { id: "correctionOf", valueType: { kind: "text" } },
    { id: "creditAccountReference", valueType: { kind: "text" } },
    { id: "debitAccountReference", valueType: { kind: "text" } },
    { id: "originatingOperationReference", valueType: { kind: "text" } },
    { id: "postingDate", valueType: { kind: "text" } },
    { id: "postingReference", valueType: { kind: "text" } },
    { id: "reason", valueType: { kind: "text" } },
  ],
  precondition: {
    kind: "binary",
    left: {
      kind: "binary",
      left: {
        kind: "relation",
        relationId: "accounting.originalAmount",
      },
      operator: "add",
      right: {
        kind: "binary",
        left: {
          kind: "relation",
          relationId: "accounting.postedDebitTotal",
        },
        operator: "add",
        right: {
          kind: "relation",
          relationId: "accounting.postedCreditTotal",
        },
      },
    },
    operator: "greater_than",
    right: {
      kind: "binary",
      left: {
        kind: "relation",
        relationId: "accounting.postedDebitTotal",
      },
      operator: "add",
      right: {
        kind: "relation",
        relationId: "accounting.postedCreditTotal",
      },
    },
  },
});

export default defineBundle({
  actions: [
    applySettlement,
    correctPosting,
    postPayable,
    postReceivable,
    recordAccountIdentity,
    recordBookIdentity,
    recordLedgerIdentity,
    reversePosting,
  ],
  computations: [postingDifference, remainingClaim],
  id: "accounting.foundation",
  relations: [
    accountClassification,
    accountCode,
    accountName,
    appliedAmount,
    bookCode,
    bookReference,
    claimCurrency,
    claimKind,
    claimReference,
    correctionOf,
    correctionPostingReference,
    correctionReason,
    counterpartyReference,
    creditAccountReference,
    creditAmount,
    debitAccountReference,
    debitAmount,
    eventDate,
    fulfillmentOperationReference,
    functionalCurrency,
    historicalBookMeaning,
    ledgerBookReference,
    ledgerCode,
    ledgerReference,
    manufacturingOccurrenceReference,
    originalAmount,
    originatingOperationReference,
    paymentDate,
    postedCreditTotal,
    postedDebitTotal,
    postingDate,
    postingReference,
    reversalOf,
    reversalPostingReference,
    settlementAmount,
    settlementCurrency,
    settlementOperationReference,
    settlementReference,
  ],
  revision: 1,
  types: [Account, Book, EconomicClaim, Ledger, Posting, Settlement],
});
