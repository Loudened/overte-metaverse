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

import { Request } from 'express';

export abstract class CriteriaFilter {

  // Take a request and extract filter parameters
  abstract parametersFromRequest(pRequest: Request): void;

  // Test a thing and return 'true' if it should be included in the set
  abstract criteriaTest(pThingy: any): boolean;

  // Return Mongodb criteria for the search query
  // This changes what 'criteriaTest' returns since the testing is now
  //     expected to be in the query.
  abstract criteriaParameters(): any;

  // return Mongodb critera for sort operations
  abstract sortCriteriaParameters(): any;
};
