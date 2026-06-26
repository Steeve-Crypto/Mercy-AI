-- Manual beta provisioning status expansion.
-- Keeps signup/Stripe flow intact while allowing superadmin-created beta states.

alter type mercy_subscription_status add value if not exists 'trialing';
alter type mercy_subscription_status add value if not exists 'suspended';

-- Microsoft Office NAA beta provisioning uses the same account-state language.
-- Legacy "disabled" mapping rows are now suspended, and the backend-only table
-- rejects non-canonical account states.
update microsoft_identity_mappings
set status = 'suspended'
where status = 'disabled';

alter table microsoft_identity_mappings
drop constraint if exists ck_microsoft_identity_status;

alter table microsoft_identity_mappings
add constraint ck_microsoft_identity_status
check (status in ('pending', 'trialing', 'active', 'suspended', 'canceled'));
