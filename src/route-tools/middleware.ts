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

'use strict';

import { Router, RequestHandler, Request, Response, NextFunction } from 'express';

import { Accounts } from '@Entities/Accounts';
import { AccountEntity } from '@Entities/AccountEntity';
import { Domains } from '@Entities/Domains';
import { Sessions } from '@Entities/Sessions';
import { Tokens } from '@Entities/Tokens';

import { RESTResponse } from './RESTResponse';

import { IsNullOrEmpty, IsNotNullOrEmpty } from '@Tools/Misc';
import { Logger } from '@Tools/Logging';
import { Config } from '@Base/config';
import { SessionEntity } from '@Entities/SessionEntity';

// MetaverseAPI middleware.
// The request is a standard MetaverseAPI JSON-in and JSON-out request.
// Start by decorating the request with the building class that is used to create the response
//     and setup the session.
export const setupMetaverseAPI: RequestHandler = async (req: Request, resp: Response, next: NextFunction) => {
  req.vRestResp = new RESTResponse(req, resp);
  if (req.socket) {
    req.vSenderKey = `${req.socket.remoteAddress}:${req.socket.remotePort}`;

    req.vSession = Sessions.getSessionWithSenderKey(req.vSenderKey);
    if (req.vSession) {
      SessionEntity.TouchSession(req.vSession);
    }
    else {
      // No existing session for this request
      req.vSession = Sessions.createSession(req.vSenderKey);
      Sessions.addSession(req.vSession);
      Logger.debug('setupMetaverseAPI: created new session for ' + req.vSenderKey);
    };

    const authToken = req.vRestResp.getAuthToken();
    if (IsNotNullOrEmpty(authToken)) {
      try {
        req.vAuthToken = await Tokens.getTokenWithToken(authToken);
      }
      catch (err) {
        Logger.error(`setupMetaverseAPI: exception in token lookup: ${err}`);
      };
    };
  };
  next();
};

// MetaverseAPI middleware.
// Finish the API call by constructing the '{"status": "success", "data": RESPONSE }' JSON response
// The request is terminated here by either 'resp.end()' or 'resp.json()'.
export const finishMetaverseAPI: RequestHandler = async (req: Request, resp: Response, next: NextFunction) => {
  // Logger.debug('finishMetaverseAPI: enter');
  if (req.vRestResp) {
    resp.statusCode = req.vRestResp.HTTPStatus;
    const response = req.vRestResp.buildRESTResponse();
    if (response) {
      Logger.cdebug('metaverseapi-response-detail', 'finishMetaverseAPI: response: ' + JSON.stringify(response));
      resp.json(response);
    }
    else {
      resp.end();
    };
  };
};

// Like 'finishMetaverseAPI' but doesn't return the status/data JSON object but only
//    returns the data body as the JSON response.
// This is needed for some of the API requests (eg. /oauth/token) who's response is
//    just JSON data.
// The request is terminated here by either 'resp.end()' or 'resp.json()'.
export const finishReturnData: RequestHandler = async (req: Request, resp: Response, next: NextFunction) => {
  if (req.vRestResp) {
    resp.statusCode = req.vRestResp.HTTPStatus;
    const response = req.vRestResp.buildRESTResponse();
    if (response && response.data) {
      Logger.cdebug('metaverseapi-response-detail', 'finishMetaverseAPI: response: ' + JSON.stringify(response.data));
      resp.json(response.data);
    }
    else {
      resp.end();
    };
  };
};

// MetaverseAPI middleware.
// Check for account specified by request 'Authorization:' token.
// Decorate passed Request with 'vAuthToken' and 'vAuthAccount' which point
//      to an AccountEntity.
// If account cannot be found, sets 'vAuthAccount' to undefined.
export const accountFromAuthToken: RequestHandler = async (req: Request, resp: Response, next: NextFunction) => {
  if (req.vRestResp) {
    if (IsNotNullOrEmpty(req.vAuthToken)) {
      req.vAuthAccount = await Accounts.getAccountWithId(req.vAuthToken.accountId);
    };
  };
  if (IsNullOrEmpty(req.vAuthAccount)) {
    req.vAccountError = 'No account found for authorization';
    Logger.debug('accountFromAuthToken: account lookup fail: authToken=' + req.vRestResp.getAuthToken());
  };
  next();
};

// MetaverseAPI middleware.
// The request has a :accountId label that needs to be looked up and verified.
// We check if the accountId is either an account username or the accountId.
// Decorate the passed Request with 'vAccount' which points to a AccountEntity.
// If account cannot be found or verified, 'vAccountError' is set with text explaining the error.
export const accountFromParams: RequestHandler = async (req: Request, resp: Response, next: NextFunction) => {
  if (req.vRestResp) {
    const accountId = req.params.accountId;
    if (accountId) {
      // Most of the account references are by username
      req.vAccount = await Accounts.getAccountWithUsername(accountId);
      if (IsNullOrEmpty(req.vAccount)) {
        // If username didn't work, try by the accountId
        req.vAccount = await Accounts.getAccountWithId(accountId);
      };

    };
  };
  if (IsNullOrEmpty(req.vAccount)) {
    req.vAccountError = 'AccountId does not match an account';
  };
  next();
};

// Find domain apikey from JSON body and set as 'vDomainAPIKey'
export const usernameFromParams: RequestHandler = async (req: Request, resp: Response, next: NextFunction) => {
  if (req.vRestResp) {
    req.vUsername = req.params.username;
  };
  next();
};

// MetaverseAPI middleware.
// The request has a :domainId label that needs to be looked up and verified.
// Decorate the passed Request with 'vDoamin' which points to a DomainEntity.
// If domain cannot be found or verified, 'vDomainError' is set with text explaining the error.
export const domainFromParams: RequestHandler = async (req: Request, resp: Response, next: NextFunction) => {
  let domainId: string;
  if (req.vRestResp) {
    domainId = req.params.domainId;
    if (domainId) {
      req.vDomain = await Domains.getDomainWithId(domainId);
    }
    else {
      Logger.error(`domainFromParams: wanted domain but none specified`);
    };
  };
  if (IsNullOrEmpty(req.vDomain)) {
    req.vDomainError = 'DomainId does not match a domain';
    Logger.error(`domainFromParams: wanted domain ${domainId} but not found`);
  };
  next();
};

// Find domain apikey from JSON body and set as 'vDomainAPIKey'
export const domainAPIkeyFromBody: RequestHandler = async (req: Request, resp: Response, next: NextFunction) => {
  if (req.body && req.body.domain && req.body.domain.api_key) {
    req.vDomainAPIKey = req.body.domain.api_key;
  };
  next();
};

// Find domain apikey from previously parsed multi-part form body and set as 'vDomainAPIKey'
export const domainAPIkeyFromMultipart: RequestHandler = async (req: Request, resp: Response, next: NextFunction) => {
  if (req.body && req.body.api_key) {
    req.vDomainAPIKey = req.body.api_key;
  };
  next();
};

// Check that 'vDomain' has access. Checks 'vDomainAPIKey' and request's authtoken.
// If the domain in 'vDomain' does not check out, null out 'vDomain'.
export const verifyDomainAccess: RequestHandler = async (req: Request, resp: Response, next: NextFunction) => {
    if (req.vRestResp && req.vDomain) {
      let verified: boolean = false;

      const authToken = req.vRestResp.getAuthToken();
      // Logger.debug(`verifyDomainAccess: domainId: ${req.vDomain.domainId}, authT: ${authToken}, apikey: ${req.vDomainAPIKey}`);

      if (IsNullOrEmpty(authToken)) {
        // Auth token not available. See if APIKey does the trick
        if (req.vDomain.apiKey === req.vDomainAPIKey) {
          verified = true;
        };
      }
      else {
        const aAccount: AccountEntity = await Accounts.getAccountWithAuthToken(authToken);
        if (aAccount) {
          if (IsNullOrEmpty(req.vDomain.sponserAccountId)) {
            // If the domain doesn't have an associated account, form the link to this account
            await Domains.updateEntityFields(req.vDomain, { 'sponserAccountId': aAccount.accountId } );
          };
          if (req.vDomain.sponserAccountId === aAccount.accountId) {
            verified = true;
          };
        };
      };

      if (!verified) {
        req.vDomain = undefined;
        req.vDomainError = 'Domain not authorized';
      };
    };
    next();
};

// MetaverseAPI middleware.
// The request has a :tokenId label that is returned in 'vTokenId'.
export const tokenFromParams: RequestHandler = async (req: Request, resp: Response, next: NextFunction) => {
  if (req.vRestResp) {
    req.vTokenId = req.params.tokenId;
  };
  next();
};
// MetaverseAPI middleware.
// The request has a :tokenId label that is returned in 'vTokenId'.
export const param1FromParams: RequestHandler = async (req: Request, resp: Response, next: NextFunction) => {
  if (req.vRestResp) {
    req.vParam1 = req.params.param1;
  };
  next();
};
// MetaverseAPI middleware.
// The request has a :tokenId label that is returned in 'vTokenId'.
export const param2FromParams: RequestHandler = async (req: Request, resp: Response, next: NextFunction) => {
  if (req.vRestResp) {
    req.vParam2 = req.params.param2;
  };
  next();
};
// MetaverseAPI middleware.
// The request has a :tokenId label that is returned in 'vTokenId'.
export const param3FromParams: RequestHandler = async (req: Request, resp: Response, next: NextFunction) => {
  if (req.vRestResp) {
    req.vParam3 = req.params.param3;
  };
  next();
};