# Demo Seed Data

This backend has a demo seed script for local development and QA.

## Commands

```bash
cd backend
npm run seed
```

Creates or refreshes the demo entries without deleting unrelated database data.

```bash
npm run seed:reset
```

Deletes only the known demo entries, then recreates them.

```bash
npm run seed:fresh
```

Deletes all app collections and recreates a clean demo database. This removes users, tenants, properties, inquiries, appointments, availability, refresh tokens, and subscription plans before seeding.

## Demo Login

All demo accounts use this password:

```txt
Demo12345
```

Accounts:

```txt
superadmin@luxestate.test
agency.admin@luxestate.test
agent.one@luxestate.test
agent.two@luxestate.test
ind.agent@luxestate.test
buyer.one@luxestate.test
buyer.two@luxestate.test
```

## Seeded Data

- Subscription plans for individual agents and agencies
- One active agency tenant
- Super admin, agency admin, agency agents, independent agent, and buyers
- Approved listings
- Pending featured approval listing
- Submitted property approval listing
- Rejected listing with reason
- Inquiries and replies
- Appointments
- Agent availability slots

## Notes

Make sure `MONGO_URL` is set in `backend/.env` before running the seed script.
