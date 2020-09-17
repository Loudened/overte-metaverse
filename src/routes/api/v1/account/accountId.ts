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

import { Router, RequestHandler, Request, Response, NextFunction } from 'express';
import { setupMetaverseAPI, finishMetaverseAPI } from '@Route-Tools/middleware';
import { accountFromAuthToken, accountFromParams } from '@Route-Tools/middleware';
import { tokenFromParams } from '@Route-Tools/middleware';

import { Perm, checkAccessToEntity } from '@Route-Tools/Permissions';
import { buildAccountInfo } from '@Route-Tools/Util';

import { Accounts } from '@Entities/Accounts';
import { setAccountField, getAccountUpdateForField } from '@Entities/AccountEntity';

import { VKeyedCollection } from '@Tools/vTypes';
import { Logger } from '@Tools/Logging';

// metaverseServerApp.use(express.urlencoded({ extended: false }));

const procGetAccountId: RequestHandler = async (req: Request, resp: Response, next: NextFunction) => {
  if (req.vAuthAccount && req.vAccount) {
    if (checkAccessToEntity(req.vAuthToken, req.vAccount, [ Perm.OWNER, Perm.ADMIN ])) {
      req.vRestResp.Data = {
        account: await buildAccountInfo(req, req.vAccount)
      };
    }
    else {
      req.vRestResp.respondFailure('Unauthorized');
    };
  }
  else {
    req.vRestResp.respondFailure('No account specified');
  };
  next();
};

// Set changable values on an account.
// The setter must be either an admin account or the account itself
const procPostAccountId: RequestHandler = async (req: Request, resp: Response, next: NextFunction) => {
  if (req.vRestResp) {
    if (req.vAuthAccount && req.vAccount) {
      if ( Accounts.isAdmin(req.vAuthAccount)
            || req.vAuthAccount.accountId === req.vAccount.accountId) {
        const updated: VKeyedCollection = {};
        if (req.body.accounts) {
          const valuesToSet = req.body.accounts;
          if (valuesToSet.hasOwnProperty('username')) updated.username = valuesToSet.username;
          if (valuesToSet.hasOwnProperty('email')) updated.email = valuesToSet.email;
          if (valuesToSet.hasOwnProperty('public_key')) updated.sessionPublicKey = valuesToSet.public_key;
          if (valuesToSet.hasOwnProperty('images')) {
            updated.images = {};
            if (valuesToSet.images.hasOwnProperty('hero')) updated.images.hero = valuesToSet.images.hero;
            if (valuesToSet.images.hasOwnProperty('thumbnail')) updated.images.hero = valuesToSet.images.thumbnail;
            if (valuesToSet.images.hasOwnProperty('tiny')) updated.images.hero = valuesToSet.images.tiny;
          };
          await Accounts.updateEntityFields(req.vAuthAccount, updated);

        };
      }
      else {
        req.vRestResp.respondFailure(req.vAccountError ?? 'Unauthorized');
      };
      // Alternate account update code using the 'setAccountField' routines.
      // This is better at checking for permissions and value validation but not tested.
      // It is expected that future Vircadia code would use the individual fieldname operations to change settings.
      /*
      const valuesToSet = req.body.accounts;
      let updates: VKeyedCollection = {};
      [ 'username', 'email', 'public_key' ].forEach( prop => {
        if (valuesToSet.hasOwnProperty(prop)) {
          if (await setAccountField(req.vAuthToken, req.vAccount, prop, valuesToSet.username, req.vAuthAccount)) {
            updates = getAccountUpdateForField(req.vAccount, prop, updates);
          };
        };
      });
      if (valuesToSet.hasOwnProperty('images')) {
        if (valuesToSet.images.hero) {
          if (await setAccountField(req.vAuthToken, req.vAccount, 'images_hero', valuesToSet.images.hero, req.vAuthAccount)) {
            updates = getAccountUpdateForField(req.vAccount, 'images_hero', updates);
          };
        };
        if (valuesToSet.images.tiny) {
          if (await setAccountField(req.vAuthToken, req.vAccount, 'images_tiny', valuesToSet.images.tiny, req.vAuthAccount)) {
            updates = getAccountUpdateForField(req.vAccount, 'images_tiny', updates);
          };
        };
        if (valuesToSet.images.thumbnail) {
          if (await setAccountField(req.vAuthToken, req.vAccount, 'images_thumbnail', valuesToSet.images.thumbnail, req.vAuthAccount)) {
            updates = getAccountUpdateForField(req.vAccount, 'images_thumbnail', updates);
          };
        };
      };
      await Accounts.updateEntityFields(req.vAuthAccount, updates);
      */
    }
    else {
      req.vRestResp.respondFailure(req.vAccountError ?? 'Accounts not specified');
    };
  };
  next();
};

// Delete an account.
// The setter must be an admin account.
const procDeleteAccountId: RequestHandler = async (req: Request, resp: Response, next: NextFunction) => {
  if (req.vRestResp) {
    if (req.vAuthAccount && req.vAccount) {
      if (Accounts.isAdmin(req.vAuthAccount)) {
        await Accounts.removeAccount(req.vAccount);
      };
    };
  };
  next();
};

export const name = '/api/v1/account/:accountId';

export const router = Router();

router.get(  '/api/v1/account/:accountId',        [ setupMetaverseAPI,
                                                    accountFromAuthToken,   // vRestResp.vAuthAccount
                                                    accountFromParams,
                                                    procGetAccountId,
                                                    finishMetaverseAPI ] );
router.post(  '/api/v1/account/:accountId',       [ setupMetaverseAPI,
                                                    accountFromAuthToken,   // vRestResp.vAuthAccount
                                                    accountFromParams,
                                                    procPostAccountId,
                                                    finishMetaverseAPI ] );
router.delete('/api/v1/account/:accountId',       [ setupMetaverseAPI,
                                                    accountFromAuthToken,   // vRestResp.vAuthAccount
                                                    accountFromParams,      // vRestResp.vAccount
                                                    procDeleteAccountId,
                                                    finishMetaverseAPI ] );
