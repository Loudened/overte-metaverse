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

import Config from '../config';

import { Entity } from '@Entities/Entity';

// NOTE: this class cannot have functions in them as they are just JSON to and from the database
export class AccountEntity implements Entity {
  public accountId: string;
  public username: string;
  public email: string;
  public accountSettings: string; // JSON of client settings
  public images: {
    hero: string;
    thumbNail: string;
    tiny: string;
  };
  public location: {
    connected: boolean;
    path: string;       // "/floatX,floatY,floatZ/floatX,floatY,floatZ,floatW"
    placeId: string;    // uuid of place
    domainId: string;   // uuid of domain located in
    networkAddress: string;
    networkPort: number;
    nodeId: string;     // sessionId
    availability: string;  // one of 'none', 'friends', 'connections', 'all'
  };
  public connections: string[];
  public friends: string[];
  public locker: string;      // JSON blob stored for user from server

  // User authentication
  public passwordHash: string;
  public passwordSalt: string;
  public sessionPublicKey: string;  // PEM public key generated for this session

  // Old stuff
  public xmppPassword: string;
  public discourseApiKey: string;
  public walletId: string;

  // Admin stuff
  // ALWAYS USE functions in Roles class to manipulate this list of roles
  public roles: string[];           // account roles (like 'admin')
  public IPAddrOfCreator: string;   // IP address that created this account
  public whenAccountCreated: Date;  // date of account creation
  public timeOfLastHeartbeat: Date; // when we last heard from this user
};

// Helper function that checks to make sure 'availability' is the right value.
// Returns 'true' if availability is legal
export function checkAvailability(pAvailability: string): boolean {
  return ['none', 'all', 'friends', 'connections'].includes(pAvailability);
}