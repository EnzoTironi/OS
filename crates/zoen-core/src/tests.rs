use std::collections::{BTreeMap, BTreeSet};

use crate::expression::apply_expression_operator;
use crate::{
    ActionId, ActionPreviewHash, BinaryOperator, DefinitionDigest, DelegationChain,
    DelegationError, DelegationGrant, DelegationId, ExactDecimal, ExactInteger, ExactValue,
    Expression, InputId, RelationId, ResourceId, SemanticValue, TimestampMicros, UnitId, ValidTime,
    WorkloadId, evaluate_expression,
};

#[test]
fn exact_integer_accepts_only_canonical_unbounded_forms() {
    for accepted in [
        "0",
        "12",
        "-12",
        "9223372036854775808",
        "-9223372036854775809",
    ] {
        let integer = ExactInteger::parse(accepted).expect("canonical integer");
        assert_eq!(integer.as_str(), accepted);
    }
    for rejected in ["", "-0", "01", "001", "+1", "1.0", "1e2"] {
        assert!(ExactInteger::parse(rejected).is_err(), "{rejected}");
    }
}

#[test]
fn exact_decimal_accepts_only_canonical_forms() {
    for accepted in ["0", "12", "-12", "0.125", "-0.125", "12.5"] {
        assert!(ExactDecimal::parse(accepted).is_ok(), "{accepted}");
    }
    for rejected in ["", "-0", "01", "1.0", "1.", ".1", "+1", "1e2"] {
        assert!(ExactDecimal::parse(rejected).is_err(), "{rejected}");
    }
}

#[test]
fn expression_operator_compares_exact_decimals() {
    let decimal =
        |value: &str| ExactValue::Decimal(ExactDecimal::parse(value).expect("canonical decimal"));

    for (left, right, expected) in [
        ("-1", "0", false),
        ("0", "-1", true),
        ("0.125", "0.5", false),
        ("-0.125", "-1", true),
        ("12.5", "12.5", false),
    ] {
        assert_eq!(
            apply_expression_operator(
                BinaryOperator::GreaterThan,
                &decimal(left),
                &decimal(right),
            )
            .expect("comparison"),
            ExactValue::Bool(expected),
            "{left} > {right}"
        );
    }
}

#[test]
fn expression_evaluation_uses_typed_input_and_relation_bindings() {
    let input_id = InputId::parse("quantity").expect("input");
    let relation_id = RelationId::parse("inventory.available").expect("relation");
    let expression = Expression::Binary {
        left: Box::new(Expression::Relation(relation_id.clone())),
        operator: BinaryOperator::GreaterThan,
        right: Box::new(Expression::Input(input_id.clone())),
    };
    let inputs = BTreeMap::from([(
        input_id,
        ExactValue::Integer(ExactInteger::parse("2").expect("integer")),
    )]);
    let relations = BTreeMap::from([(
        relation_id,
        vec![SemanticValue {
            dependencies: Vec::new(),
            value: ExactValue::Integer(ExactInteger::parse("6").expect("integer")),
        }],
    )]);

    let values = evaluate_expression(&expression, &inputs, &relations).expect("evaluation");

    assert_eq!(
        values,
        vec![SemanticValue {
            dependencies: Vec::new(),
            value: ExactValue::Bool(true),
        }]
    );
}

#[test]
fn expression_evaluation_uses_additive_identity_for_missing_relations() {
    let input_id = InputId::parse("quantity").expect("input");
    let relation_id = RelationId::parse("inventory.accumulator").expect("relation");
    let unit = UnitId::parse("each").expect("unit");
    let quantity = |amount: &str| ExactValue::Quantity {
        amount: ExactDecimal::parse(amount).expect("amount"),
        unit: unit.clone(),
    };
    let inputs = BTreeMap::from([(input_id.clone(), quantity("3"))]);
    let relations = BTreeMap::new();

    let added = evaluate_expression(
        &Expression::Binary {
            left: Box::new(Expression::Relation(relation_id.clone())),
            operator: BinaryOperator::Add,
            right: Box::new(Expression::Input(input_id.clone())),
        },
        &inputs,
        &relations,
    )
    .expect("missing accumulator addition");
    let subtracted = evaluate_expression(
        &Expression::Binary {
            left: Box::new(Expression::Input(input_id.clone())),
            operator: BinaryOperator::Subtract,
            right: Box::new(Expression::Relation(relation_id.clone())),
        },
        &inputs,
        &relations,
    )
    .expect("missing accumulator subtraction");
    let compared = evaluate_expression(
        &Expression::Binary {
            left: Box::new(Expression::Relation(relation_id)),
            operator: BinaryOperator::GreaterThan,
            right: Box::new(Expression::Input(input_id)),
        },
        &inputs,
        &relations,
    )
    .expect("missing comparison");

    let expected = vec![SemanticValue {
        dependencies: Vec::new(),
        value: quantity("3"),
    }];
    assert_eq!(added, expected);
    assert_eq!(subtracted, expected);
    assert!(compared.is_empty());
}

#[test]
fn expression_evaluation_preserves_exact_quantity_units() {
    let unit = UnitId::parse("kg").expect("unit");
    let quantity = |amount: &str| ExactValue::Quantity {
        amount: ExactDecimal::parse(amount).expect("amount"),
        unit: unit.clone(),
    };

    assert_eq!(
        apply_expression_operator(
            BinaryOperator::GreaterThan,
            &quantity("5"),
            &quantity("0.125"),
        )
        .expect("comparison"),
        ExactValue::Bool(true)
    );
    assert_eq!(
        apply_expression_operator(BinaryOperator::Subtract, &quantity("10"), &quantity("3"),)
            .expect("subtraction"),
        quantity("7")
    );
    assert_eq!(
        apply_expression_operator(BinaryOperator::Add, &quantity("-0.5"), &quantity("1.125"),)
            .expect("addition"),
        quantity("0.625")
    );
}

#[test]
fn digest_requires_lowercase_sha256_hex() {
    assert!(DefinitionDigest::parse("a".repeat(64)).is_ok());
    assert!(DefinitionDigest::parse("A".repeat(64)).is_err());
    assert!(DefinitionDigest::parse("a".repeat(63)).is_err());
}

#[test]
fn child_delegation_cannot_expand_any_scope_dimension() {
    let parent = delegation(
        "delegation.parent",
        ["action.purchase"],
        ["resource.item"],
        ["workload.agent"],
        10,
        100,
    );
    let child = delegation(
        "delegation.child",
        ["action.other"],
        ["resource.item"],
        ["workload.agent"],
        20,
        90,
    );
    assert!(matches!(
        DelegationChain::new(vec![parent, child]),
        Err(DelegationError::ExpandedAction(_))
    ));

    let parent = delegation(
        "delegation.parent",
        ["action.purchase"],
        ["resource.item"],
        ["workload.agent"],
        10,
        100,
    );
    let child = delegation(
        "delegation.child",
        ["action.purchase"],
        ["resource.other"],
        ["workload.agent"],
        20,
        90,
    );
    assert!(matches!(
        DelegationChain::new(vec![parent, child]),
        Err(DelegationError::ExpandedResource(_))
    ));

    let parent = delegation(
        "delegation.parent",
        ["action.purchase"],
        ["resource.item"],
        ["workload.agent"],
        10,
        100,
    );
    let child = delegation(
        "delegation.child",
        ["action.purchase"],
        ["resource.item"],
        ["workload.human"],
        20,
        90,
    );
    assert!(matches!(
        DelegationChain::new(vec![parent, child]),
        Err(DelegationError::ExpandedWorkload(_))
    ));

    let parent = delegation(
        "delegation.parent",
        ["action.purchase"],
        ["resource.item"],
        ["workload.agent"],
        10,
        100,
    );
    let child = delegation(
        "delegation.child",
        ["action.purchase"],
        ["resource.item"],
        ["workload.agent"],
        5,
        90,
    );
    assert!(matches!(
        DelegationChain::new(vec![parent, child]),
        Err(DelegationError::ExpandedTime(_))
    ));
}

#[test]
fn resource_grant_covers_dotted_children_not_siblings() {
    let note = ResourceId::parse("personal.note").expect("type root");
    let reminder = ResourceId::parse("personal.reminder").expect("type root");
    let lake = ResourceId::parse("personal.memory").expect("lake");
    let note_one = ResourceId::parse("personal.note.deadbeef").expect("note");
    let reminder_one = ResourceId::parse("personal.reminder.cafe").expect("reminder");
    assert!(note.covers(&note));
    assert!(note.covers(&note_one));
    assert!(!note.covers(&reminder_one));
    assert!(!lake.covers(&note_one));
    assert!(!lake.covers(&reminder_one));
    assert!(reminder.covers(&reminder_one));
    assert!(
        !ResourceId::parse("personal.note")
            .expect("root")
            .covers(&ResourceId::parse("personal.note2.x").expect("neighbor"))
    );
}

#[test]
fn lake_type_root_grant_permits_child_note_instances() {
    let grant = delegation(
        "delegation.personal",
        ["personal.writeMemory", "personal.createReminder"],
        ["personal.memory", "personal.note", "personal.reminder"],
        ["workload.admin.a"],
        10,
        100,
    );
    let at = TimestampMicros::new(50);
    let workload = WorkloadId::parse("workload.admin.a").expect("workload");
    assert!(grant.permits(
        &ActionId::parse("personal.createReminder").expect("action"),
        &ResourceId::parse("personal.reminder.cafe").expect("instance"),
        &workload,
        at,
    ));
    assert!(grant.permits(
        &ActionId::parse("personal.writeMemory").expect("action"),
        &ResourceId::parse("personal.note.deadbeef").expect("instance"),
        &workload,
        at,
    ));
    assert!(!grant.permits(
        &ActionId::parse("personal.createReminder").expect("action"),
        &ResourceId::parse("commercial.order-line.dirty-quote").expect("other"),
        &workload,
        at,
    ));
    let lake_only = delegation(
        "delegation.lake-only",
        ["personal.createReminder"],
        ["personal.memory"],
        ["workload.admin.a"],
        10,
        100,
    );
    assert!(
        !lake_only.permits(
            &ActionId::parse("personal.createReminder").expect("action"),
            &ResourceId::parse("personal.reminder.cafe").expect("instance"),
            &workload,
            at,
        ),
        "lake id is not a dotted parent of personal.reminder.*"
    );
}

#[test]
fn child_delegation_may_narrow_to_a_dotted_instance() {
    let chain = DelegationChain::new(vec![
        delegation(
            "delegation.parent",
            ["personal.createReminder"],
            ["personal.reminder"],
            ["workload.admin.a"],
            10,
            100,
        ),
        delegation(
            "delegation.child",
            ["personal.createReminder"],
            ["personal.reminder.cafe"],
            ["workload.admin.a"],
            20,
            90,
        ),
    ])
    .expect("instance is a child of the type root");
    assert!(chain.permits(
        &ActionId::parse("personal.createReminder").expect("action"),
        &ResourceId::parse("personal.reminder.cafe").expect("instance"),
        &WorkloadId::parse("workload.admin.a").expect("workload"),
        TimestampMicros::new(50),
    ));
}

#[test]
fn narrowed_delegation_authorizes_only_the_leaf_scope() {
    let chain = DelegationChain::new(vec![
        delegation(
            "delegation.parent",
            ["action.purchase", "action.return"],
            ["resource.item", "resource.other"],
            ["workload.agent", "workload.human"],
            10,
            100,
        ),
        delegation(
            "delegation.child",
            ["action.purchase"],
            ["resource.item"],
            ["workload.agent"],
            20,
            90,
        ),
    ])
    .expect("narrowed chain");
    assert!(chain.permits(
        &ActionId::parse("action.purchase").expect("action"),
        &ResourceId::parse("resource.item").expect("resource"),
        &WorkloadId::parse("workload.agent").expect("workload"),
        TimestampMicros::new(50),
    ));
    assert!(!chain.permits(
        &ActionId::parse("action.return").expect("action"),
        &ResourceId::parse("resource.item").expect("resource"),
        &WorkloadId::parse("workload.agent").expect("workload"),
        TimestampMicros::new(50),
    ));
}

#[test]
fn valid_time_distinguishes_instants_and_half_open_intervals() {
    let instant = ValidTime::instant(TimestampMicros::new(10));
    assert!(instant.contains(TimestampMicros::new(10)));
    assert!(!instant.contains(TimestampMicros::new(11)));

    let interval = ValidTime::interval(TimestampMicros::new(10), TimestampMicros::new(20))
        .expect("ordered interval");
    assert!(interval.contains(TimestampMicros::new(10)));
    assert!(interval.contains(TimestampMicros::new(19)));
    assert!(!interval.contains(TimestampMicros::new(20)));
    assert!(ValidTime::interval(TimestampMicros::new(20), TimestampMicros::new(20)).is_err());
}

fn delegation<const A: usize, const R: usize, const W: usize>(
    id: &str,
    actions: [&str; A],
    resources: [&str; R],
    workloads: [&str; W],
    not_before: i64,
    expires_at: i64,
) -> DelegationGrant {
    DelegationGrant::new(
        DelegationId::parse(id).expect("delegation"),
        actions
            .into_iter()
            .map(|value| ActionId::parse(value).expect("action"))
            .collect::<BTreeSet<_>>(),
        resources
            .into_iter()
            .map(|value| ResourceId::parse(value).expect("resource"))
            .collect::<BTreeSet<_>>(),
        workloads
            .into_iter()
            .map(|value| WorkloadId::parse(value).expect("workload"))
            .collect::<BTreeSet<_>>(),
        TimestampMicros::new(not_before),
        TimestampMicros::new(expires_at),
    )
    .expect("delegation grant")
}

#[test]
fn action_preview_hash_placeholder_is_all_zero_hex() {
    let placeholder = ActionPreviewHash::parse("0".repeat(64)).expect("placeholder");
    let real = ActionPreviewHash::parse("ab".repeat(32)).expect("real");
    assert!(placeholder.is_uncomputed_placeholder());
    assert!(!real.is_uncomputed_placeholder());
}

#[test]
fn action_preview_hash_constant_time_eq_requires_identical_hex() {
    let left = ActionPreviewHash::parse("ab".repeat(32)).expect("left");
    let right = ActionPreviewHash::parse("ab".repeat(32)).expect("right");
    let other = ActionPreviewHash::parse("ba".repeat(32)).expect("other");
    assert!(left.constant_time_eq(&right));
    assert!(!left.constant_time_eq(&other));
}
