-- Manual beta provisioning status expansion.
-- Keeps signup/Stripe flow intact while allowing superadmin-created beta states.

alter type mercy_subscription_status add value if not exists 'trialing';
alter type mercy_subscription_status add value if not exists 'suspended';
