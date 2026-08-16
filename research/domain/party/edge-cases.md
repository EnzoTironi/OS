---
issue: 14
kind: explanation
fetched: 2026-08-16
decision_state: hypothesis
---

# Edge cases

Sixteen scenarios that try to break the fragment in `fragment.md`. Each card names the cut it attacks, the evidence it uses, and what a surviving model must still answer.

These are counterexamples, not product tests.

## EC01. Supplier is also customer

**Attacks.** Role versus kind.
**Given.** Organization B sells raw material to A and buys finished goods from A. S-005.
**Must answer.** Is B one party with two relationships, or two masters? Where do payment terms live when they differ by direction?
**Source pressure.** ERPNext Party Link keeps two masters and offsets books. Odoo uses one partner. Moqui uses two RoleTypes. VF uses one AgentRelationship role pair.
**Fails the fragment if.** Destroying the customer record destroys the supplier, or the reverse, while the organization still exists.

## EC02. Employment with promotion, hold, and exit

**Attacks.** Relationship lifecycle. S-006.
**Given.** Person P works for Organization O from January to July, changes position in March, compensation in May, is suspended, then leaves.
**Must answer.** Can Promote, Suspend, and Terminate target the employment? Can history stay queryable after exit?
**Source pressure.** Frappe HR puts exit on the Employee master and hides Left employees from later transactions. Odoo keeps a personnel file plus Contracts. Moqui uses fromDate, thruDate, and status history. OntoUML lets Employment be Tenured.
**Fails the fragment if.** A boolean worksFor is enough and still answers "what was the position in May."

## EC03. One person represents two billed parties

**Attacks.** Contact versus party.
**Given.** Morgan Lee is purchasing manager for Summit Digital Stores and also for an unrelated company.
**Must answer.** Is there one ContactPerson with two links, or two contacts that happen to share a phone?
**Source pressure.** ERPNext Contact docs allow multiple party links and warn against duplicate email and phone.
**Fails the fragment if.** Linking the contact to the second customer duplicates the person or merges the two customers.

## EC04. Shared building, different tax registrations

**Attacks.** Address as object versus party. Tax identity.
**Given.** Two unrelated customers occupy the same building. Only one has a GSTIN at that site.
**Must answer.** Can they cite the same physical location without sharing tax identity or primary flags?
**Source pressure.** ERPNext Address docs say do not link unrelated Customers merely because they share a building.
**Fails the fragment if.** One Address row forces one GSTIN onto both parties.

## EC05. Multi-state GSTIN on one legal person

**Attacks.** Tax registration versus party.
**Given.** One LegalPerson has a Maharashtra warehouse and a Delhi office, each with its own GSTIN. An invoice ships from Delhi to a Maharashtra customer.
**Must answer.** Which registration is the seller's, and is it a property of the party or of the selected site?
**Source pressure.** ERPNext GST multi-branch. GSTIN lives on Address. Tax template follows company address and party address.
**Fails the fragment if.** One Tax ID field on the party is the only place registration can live.

## EC06. Branch is not a subsidiary

**Attacks.** Legal entity versus operating entity.
**Given.** A regional office posts into the parent's books. A foreign subsidiary keeps its own books and tax id.
**Must answer.** Which one is a LegalPerson? Which one is an OperatingUnit?
**Source pressure.** ERPNext Company docs. Odoo Companies docs. Independent subsidiaries must be companies. Parent cannot later become a branch.
**Fails the fragment if.** Converting the parent into a branch preserves access rights, tax, and intercompany history.

## EC07. Internal customer is your other company

**Attacks.** Intercompany role.
**Given.** Nova Electronics Trading sells to Nova Industries. Both are Companies in the same group.
**Must answer.** Is the buyer a Customer role of a LegalPerson you also operate, or a second party kind?
**Source pressure.** ERPNext Internal Customer. Inter-company invoices still post in each entity.
**Fails the fragment if.** Marking Internal Customer deletes the need for two books.

## EC08. Informal group with agency, no legal personhood

**Attacks.** Organization versus LegalPerson.
**Given.** A fablab cooperative makes agreements as a group but has no registration.
**Must answer.** Can it be an Organization and an economic Agent without being a LegalPerson?
**Source pressure.** ValueFlows Organization is any group with agency. FIBO LegalPerson requires liability capacity. ERPNext Company requires books.
**Fails the fragment if.** Every Organization must have a tax id or a Company record.

## EC09. Special purpose vehicle

**Attacks.** LegalPerson versus operating brand.
**Given.** A parent creates an SPV to isolate bankruptcy risk. The SPV has a narrow, temporary objective and an intended liquidation date.
**Must answer.** Is the SPV a LegalPerson, an OperatingUnit, or a mode of the parent?
**Source pressure.** FIBO SPV definition. ERPNext would want a Company if it keeps books.
**Fails the fragment if.** The SPV cannot be addressed without collapsing it into the parent party.

## EC10. Transporter is a supplier role, or a different role

**Attacks.** Carrier versus supplier.
**Given.** A firm sells you freight and also sells you parts.
**Must answer.** Is Transporter a flag on Supplier, a second role, or a second relationship?
**Source pressure.** ERPNext Is Transporter on Supplier. Moqui carrier RoleType.
**Fails the fragment if.** Ticking Transporter creates a second identity for the same organization.

## EC11. Bill-to customer is not ship-to customer

**Attacks.** One Customer flag.
**Given.** A buying group is billed. Goods ship to a member hospital.
**Must answer.** Are bill-to and ship-to roles on one relationship, or two parties in two roles?
**Source pressure.** Moqui bill-to customer and ship-from vendor as RoleTypes. ERPNext multiple Addresses on one Customer. Odoo Invoice Address and Delivery Address child rows.
**Fails the fragment if.** One Customer master cannot name a different ship-to party without becoming a second customer kind.

## EC12. Duplicate records that always named one shop

**Attacks.** Merge versus succession.
**Given.** Sales created "Summit Digital" and billing created "Summit Digital Stores Ltd" for the same shop. VAT matches.
**Must answer.** Which merge operator runs? What provenance remains?
**Source pressure.** Odoo irreversible merge to the oldest contact. Dedup keys include VAT and Name. ERPNext adds a suffix when names collide and refuses to merge Customer with Supplier.
**Fails the fragment if.** The same operator is used for this case and for a statutory merger.

## EC13. Statutory merger with a surviving legal person

**Attacks.** Merge versus succession.
**Given.** Company C absorbs Company D. Contracts novate. A tax id retires. Employees move.
**Must answer.** Does D end as a LegalPerson? Do historical invoices still name D as the party they named then?
**Source pressure.** OntoUML Kind change ends the individual. FIBO legal personhood is jurisdictional. Odoo merge docs do not describe this case.
**Fails the fragment if.** Record merge is the only tool and "what did we believe then" becomes unanswerable.

## EC14. New company missing from VIES

**Attacks.** Tax identifier as observation.
**Given.** A newly formed EU customer has a well-formed VAT that VIES does not yet know.
**Must answer.** Can the identifier exist, fail a validity observation, and still be used under an override with provenance?
**Source pressure.** Odoo VIES docs. Manual override is logged in chatter.
**Fails the fragment if.** A failed VIES check deletes the partner or silently treats VAT as absent.

## EC15. Employee leaves and later buys as a customer

**Attacks.** Role exit and role entry on one Person.
**Given.** P is marked Left. A year later P buys as an individual customer. The same email is used.
**Must answer.** Is P one Person with a closed Employment and a new CustomerRelationship? Or does Left block all later use of the person?
**Source pressure.** Frappe HR. Left employees are unavailable in later transactions. ERPNext Contact can exist without a party and later be linked. Odoo archive hides a contact from the main list.
**Fails the fragment if.** Employment exit destroys the Person or forbids a later commercial role.

## EC16. Contact mechanism change must not rewrite old orders

**Attacks.** Address mutation.
**Given.** A supplier moves warehouse. Old purchase orders must still print the dock that received the goods. New orders must use the new dock. GSTIN changes with the move.
**Must answer.** Is this an in-place edit, a new Address, or an expired ContactMech plus a new one?
**Source pressure.** ERPNext. Minor correction edits. Material change creates a new Address. Submitted documents keep their text. Moqui ContactMech is immutable.
**Fails the fragment if.** Editing the current address changes the historical receiving location and the historical GSTIN.

## EC17. Power of attorney

**Attacks.** Party versus deputy. Cross-link issue 11.
**Given.** A legally competent person authorizes another to sign a supply agreement.
**Must answer.** Who is the LegalPerson on the agreement? Who is the signatory role? Who is the Actor if the deputy clicks Submit?
**Source pressure.** FIBO power of attorney. Issue 11 delegation notes. This folder does not settle Actor.
**Fails the fragment if.** The deputy becomes the Customer or the LegalPerson.

## Extra cards that stay thin

These are named so a later pass can thicken them. They still count as attacks.

- **EC18.** Competitor who later becomes a supplier.
- **EC19.** Partnership Customer Type that is not a registered LegalPerson in the operating country.
- **EC20.** User invited on a Contact that is later unlinked from the Customer.
- **EC21.** Frozen supplier while name and bank details are amended. E2.
- **EC22.** Two Companies, one Customer, different credit limits. E1.

Sixteen numbered cards plus five thin follow-ups. The acceptance bar is at least fifteen edge cases.
