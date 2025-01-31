//   Copyright 2020 Overte Contributors
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

import { AuthToken } from '@Entities/AuthToken';
import { createObject, getObject, getObjects, updateObjectFields, deleteMany, deleteOne } from '@Tools/Db';

import { GenericFilter } from '@Entities/EntityFilters/GenericFilter';
import { CriteriaFilter } from '@Entities/EntityFilters/CriteriaFilter';

import { SArray, VKeyedCollection } from '@Tools/vTypes';
import { Clamp, GenUUID, IsNullOrEmpty, IsNotNullOrEmpty } from '@Tools/Misc';
import { Logger } from '@Tools/Logging';

export const tokenCollection = 'tokens';

// Initialize token management.
// Mostly starts a periodic function that deletes expired tokens.
export function initTokens(): void {
    // Expire tokens that have pased their prime
    setInterval( async () => {
        const nowtime = new Date();
        const deletedTokens = await deleteMany(tokenCollection,
                                new GenericFilter({ 'expirationTime': { $lt: nowtime } }) );
        if (deletedTokens > 0) {
            Logger.debug(`Tokens.Expiration: expired ${deletedTokens} tokens`);
        };
    }, 1000 * 60 * 5 );
};

// Class to manage the manipulations on entities scope of application
export class TokenScope {
    public static OWNER: string = 'owner';    // a 'user' or 'person'
    public static DOMAIN: string = 'domain';  // a domain-server
    public static PLACE: string = 'place';    // a Place (APIkey)
    // Added for ActivityPub access control
    public static READ: string = 'read';
    public static WRITE: string = 'write';

    // See if the passed scope token is a known scope code.
    static KnownScope(pScope: string): boolean {
        return [ TokenScope.OWNER, TokenScope.DOMAIN, TokenScope.PLACE ].includes(pScope);
    };
};

export const Tokens = {
    // Create a new AuthToken.
    async createToken(pAccountId: string, pScope: string[], pExpireHours: number = 0): Promise<AuthToken> {
        const aToken = new AuthToken();
        aToken.id = GenUUID();
        aToken.token = GenUUID();
        aToken.refreshToken = GenUUID();
        aToken.accountId = pAccountId;
        // Verify that passed scopes are known scope codes
        aToken.scope = [];
        pScope.forEach( aScope => {
            if (TokenScope.KnownScope(aScope)) aToken.scope.push(aScope);
        });
        aToken.whenCreated = new Date();

        switch (pExpireHours) {
            case 0:
                // If expiration hours is not specified, compute default for this scope
                aToken.expirationTime = Tokens.computeDefaultExpiration(aToken.scope, aToken.whenCreated);
                break;
            case -1:
                // Expiration is infinite
                aToken.expirationTime = new Date(2399, 12);
                break;
            default:
                // There is a specification of some hours to expire
                const hours = Clamp(pExpireHours, 1, 1000000);  // max is 114 years
                aToken.expirationTime = new Date(new Date().valueOf() + hours * 1000*60*60);
                break;
        };
        return aToken;
    },
    async getTokenWithTokenId(pTokenId: string): Promise<AuthToken> {
        return IsNullOrEmpty(pTokenId) ? null : getObject(tokenCollection,
                                                new GenericFilter({ 'id': pTokenId }));
    },
    async getTokenWithToken(pToken: string): Promise<AuthToken> {
        return IsNullOrEmpty(pToken) ? null : getObject(tokenCollection,
                                                new GenericFilter({ 'token': pToken }));
    },
    async getTokenWithRefreshToken(pToken: string): Promise<AuthToken> {
        return IsNullOrEmpty(pToken) ? null : getObject(tokenCollection,
                                                new GenericFilter({ 'refreshToken': pToken }));
    },
    async addToken(pAuthToken: AuthToken) : Promise<AuthToken> {
        return createObject(tokenCollection, pAuthToken);
    },
    async removeToken(pAuthToken: AuthToken) : Promise<boolean> {
        return deleteOne(tokenCollection, new GenericFilter({ 'id': pAuthToken.id })); },
    async updateTokenFields(pEntity: AuthToken, pFields: VKeyedCollection): Promise<AuthToken> {
        return updateObjectFields(tokenCollection,
                                new GenericFilter({ 'id': pEntity.id }), pFields);
    },
    // Return all the tokens that were generated by a specific accountId
    async *getTokensForOwner(pOwnerId: string, pPager?: CriteriaFilter): AsyncGenerator<AuthToken> {
        return IsNullOrEmpty(pOwnerId)
                ? null
                : Tokens.enumerateAsync(new GenericFilter({ 'accountId': pOwnerId }), pPager);
    },
    async *enumerateAsync(pFilter?: CriteriaFilter, pPager?: CriteriaFilter, pScoper?: CriteriaFilter): AsyncGenerator<AuthToken> {
        for await (const tok of getObjects(tokenCollection, pFilter, pPager, pScoper)) {
        yield tok;
        };
        // return getObjects(tokenCollection, pFilter, pPager, pScoper); // not sure why this does't work
    },
    // Return an expiration date for the token depending on its scope
    computeDefaultExpiration(pScopes: string[], pBaseDate?: Date): Date {
        return new Date((pBaseDate ? pBaseDate.valueOf() : new Date().valueOf())
            + ( SArray.has(pScopes, TokenScope.DOMAIN)
                    ? (Config.auth["domain-token-expire-hours"] as number) * 1000*60*60
                    : (Config.auth["owner-token-expire-hours"] as number) * 1000*60*60
                )
        );
    },
    // Return 'true' if the passed token has not expired.
    hasNotExpired(pAuthToken: AuthToken): boolean {
        return IsNullOrEmpty(pAuthToken)
            ? false
            : pAuthToken.expirationTime.valueOf() > new Date().valueOf();
    },
    // Creates a special token that is used internally to do admin stuff
    // This only lasts one second and points to a non-existant account.
    createSpecialAdminToken(): AuthToken {
        const aToken = new AuthToken();
        aToken.id = GenUUID();
        aToken.token = specialAdminTokenToken;
        aToken.refreshToken = GenUUID();
        aToken.accountId = GenUUID();     // account that doesn't exist
        // Verify that passed scopes are known scope codes
        aToken.scope = [ TokenScope.OWNER ];
        aToken.whenCreated = new Date();
        aToken.expirationTime = new Date( new Date().valueOf() + 1000 ); // only lasts one second
        return aToken;
    },
    isSpecialAdminToken(pAuthToken: AuthToken): boolean {
        return pAuthToken.token === specialAdminTokenToken && Tokens.hasNotExpired(pAuthToken);
    }
};
const specialAdminTokenToken = GenUUID();
