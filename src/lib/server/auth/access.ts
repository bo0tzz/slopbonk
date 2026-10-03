import type { Db } from '../db';
import type { AccountType } from '../db/schema/tables/installation.table';
import type { Reviewer } from './session';

export interface ReviewableInstallation {
	id: number;
	accountId: number;
	login: string;
	accountType: AccountType;
}

/** The active installation on this organisation, if the reviewer may review it. */
export async function installationForReviewer(
	db: Db,
	reviewer: Reviewer | null,
	orgLogin: string
): Promise<ReviewableInstallation | null> {
	if (!reviewer) {
		return null;
	}
	const installation = await db
		.selectFrom('installations')
		.select(['id', 'account_id', 'account_login', 'account_type'])
		.where((eb) => eb(eb.fn('lower', ['account_login']), '=', orgLogin.toLowerCase()))
		.where('uninstalled_at', 'is', null)
		.executeTakeFirst();
	if (!installation || !reviewer.installationIds.includes(installation.id)) {
		return null;
	}
	return {
		id: installation.id,
		accountId: installation.account_id,
		login: installation.account_login,
		accountType: installation.account_type
	};
}
