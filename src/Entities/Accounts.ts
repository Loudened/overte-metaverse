//   Copyright 2020 Vircadia Contributors
//
//   Licensed under the Apache License, Version 2.0 (the "License");
//   you may not use this file except in compliance with the License.
//   You may obtain a copy of the License at
//
//       http://www.apache.org/licenses/LICENSE-2.0
//
//   Unless required by applicable law or agreed to in writing, software
//   distributed under the License is distributed on an "AS IS" BASIS,
//   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//   See the License for the specific language governing permissions and
//   limitations under the License.
'use strict'

import { Config } from '@Base/config';

import crypto from 'crypto';

import { AccountEntity } from '@Entities/AccountEntity';
import { AccountRoles } from '@Entities/AccountRoles';
import { Domains } from '@Entities/Domains';
import { Places } from '@Entities/Places';
import { Tokens } from '@Entities/Tokens';
import { CriteriaFilter } from '@Entities/EntityFilters/CriteriaFilter';
import { GenericFilter } from '@Entities/EntityFilters/GenericFilter';

import { createObject, getObject, getObjects, updateObjectFields, deleteOne, noCaseCollation } from '@Tools/Db';
import { GenUUID, genRandomString, IsNullOrEmpty, IsNotNullOrEmpty } from '@Tools/Misc';

import { VKeyedCollection, SArray } from '@Tools/vTypes';
import { Logger } from '@Tools/Logging';

export let accountCollection = 'accounts';

export const Accounts = {
  async getAccountWithId(pAccountId: string): Promise<AccountEntity> {
    return IsNullOrEmpty(pAccountId) ? null : getObject(accountCollection, { 'id': pAccountId });
  },
  async getAccountWithAuthToken(pAuthToken: string): Promise<AccountEntity> {
    if (IsNotNullOrEmpty(pAuthToken)) {
      try {
        const tokenInfo = await Tokens.getTokenWithToken(pAuthToken);
        if (IsNotNullOrEmpty(tokenInfo)) {
          return Accounts.getAccountWithId(tokenInfo.accountId);
        };
      }
      catch (err) {
        throw err;
      };
    };
    return null;
  },
  async getAccountWithUsername(pUsername: string): Promise<AccountEntity> {
    if (IsNotNullOrEmpty(pUsername)) {
      // build username query with case-insensitive Regex.
      // When indexes are added, create a 'username' case-insensitive index.
      // Need to clean the username of search characters since we're just passing it to the database
      return getObject(accountCollection, { 'username': pUsername }, noCaseCollation );
                // { 'username': new RegExp(['^', pUsername.replace('[\\\*]', ''), '$'].join(''), 'i') } );
    };
    return null;
  },
  async getAccountWithNodeId(pNodeId: string): Promise<AccountEntity> {
    return IsNullOrEmpty(pNodeId) ? null : getObject(accountCollection, { 'locationNodeid': pNodeId });
  },
  async getAccountWithEmail(email: string): Promise<AccountEntity> {
    return IsNullOrEmpty(email) ? null : getObject(accountCollection, { 'email': email }, noCaseCollation );
  },
  async addAccount(pAccountEntity: AccountEntity) : Promise<AccountEntity> {
    Logger.info(`Accounts: creating account ${pAccountEntity.username}, id=${pAccountEntity.id}`);
    return createObject(accountCollection, pAccountEntity);
  },
  async removeAccount(pAccountEntity: AccountEntity) : Promise<boolean> {
    Logger.info(`Accounts: removing account ${pAccountEntity.username}, id=${pAccountEntity.id}`);
    return deleteOne(accountCollection, { 'id': pAccountEntity.id } );
  },
  async removeAccountContext(pAccountEntity: AccountEntity) : Promise<void> {
    // Friends and Connections
    Logger.info(`Accounts: removing relationships for account ${pAccountEntity.username}, id=${pAccountEntity.id}`);
    if (pAccountEntity.connections) {
      for (const aConnectionName of pAccountEntity.connections) {
        const aConnection = await Accounts.getAccountWithUsername(aConnectionName);
        if (aConnection && aConnection.connections) {
          SArray.remove(aConnection.connections, pAccountEntity.username);
        };
      };
    };
    if (pAccountEntity.friends) {
      for (const aFriendName of pAccountEntity.friends) {
        const aFriend = await Accounts.getAccountWithUsername(aFriendName);
        if (aFriend && aFriend.friends) {
          SArray.remove(aFriend.friends, pAccountEntity.username);
        };
      };
    };
    // The domains associated with this account are removed also
    for await (const aDomain of Domains.enumerateAsync(new GenericFilter({ 'sponsorAccountId': pAccountEntity.id }))) {
      await Domains.removeDomain(aDomain);
      await Domains.removeDomainContext(aDomain);
    };
    // Also, any places
    await Places.removeMany(new GenericFilter( { 'accountId': pAccountEntity.id }));
  },
  // The contents of this entity have been updated
  async updateEntityFields(pEntity: AccountEntity, pFields: VKeyedCollection): Promise<AccountEntity> {
    return updateObjectFields(accountCollection, { 'id': pEntity.id }, pFields);
  },
  createAccount(pUsername: string, pPassword: string, pEmail: string): AccountEntity {
    const newAcct = new AccountEntity();
    newAcct.id= GenUUID();
    newAcct.username = pUsername;
    newAcct.email = pEmail.toLowerCase();
    newAcct.roles = [AccountRoles.USER];
    newAcct.whenCreated = new Date();

    // Remember the password
    Accounts.storePassword(newAcct, pPassword);

    return newAcct;
  },
  // TODO: add scope (admin) and filter criteria filtering
  //    It's push down to this routine so we could possibly use DB magic for the queries
  async *enumerateAsync(pPager: CriteriaFilter,
              pInfoer: CriteriaFilter, pScoper: CriteriaFilter): AsyncGenerator<AccountEntity> {
    for await (const acct of getObjects(accountCollection, pPager, pInfoer, pScoper)) {
      yield acct;
    };
    // return getObjects(accountCollection, pCriteria, pPager);
  },

  storePassword(pEntity: AccountEntity, pPassword: string) {
      pEntity.passwordSalt = genRandomString(16);
      pEntity.passwordHash = Accounts.hashPassword(pPassword, pEntity.passwordSalt);
  },
  async validatePassword(pAcct: AccountEntity, pPassword: string): Promise<boolean> {
    return Accounts.hashPassword(pPassword, pAcct.passwordSalt) === pAcct.passwordHash;
  },
  hashPassword(pPassword: string, pSalt: string): string {
      const hash = crypto.createHmac('sha512', pSalt);
      hash.update(pPassword);
      const val = hash.digest('hex');
      return val;
  },
  // Create whatever datastructure is needed to make these accounts friends
  makeAccountsFriends(pRequestingAccount: AccountEntity, pTargetAccount: AccountEntity) {
    SArray.add(pRequestingAccount.friends, pTargetAccount.username);
    SArray.add(pTargetAccount.friends, pRequestingAccount.username);
  },
  // Create whatever datastructure is needed to make these accounts friends
  makeAccountsConnected(pRequestingAccount: AccountEntity, pTargetAccount: AccountEntity) {
    SArray.add(pRequestingAccount.connections, pTargetAccount.username);
    SArray.add(pTargetAccount.connections, pRequestingAccount.username);
  },
  // getter property that is 'true' if the user has been heard from recently
  isOnline(pAcct: AccountEntity): boolean {
    if (pAcct && pAcct.timeOfLastHeartbeat) {
      return (Date.now().valueOf() - pAcct.timeOfLastHeartbeat.valueOf())
                < (Config["metaverse-server"]["heartbeat-seconds-until-offline"] * 1000);
    };
    return false;
  },
  // Return the ISODate when an account is considered offline
  dateWhenNotOnline(): string {
    const whenOffline = new Date(
          Date.now()
          - (Config["metaverse-server"]["heartbeat-seconds-until-offline"] * 1000)
    );
    return whenOffline.toISOString();
  },
  // getter property that is 'true' if the user is a grid administrator
  isAdmin(pAcct: AccountEntity): boolean {
    return SArray.has(pAcct.roles, AccountRoles.ADMIN);
  }
};
