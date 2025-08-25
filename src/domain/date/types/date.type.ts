import { Id } from 'src/domain/common/types';

export interface DateStore {
  // userId -> array of date strings (e.g., '25. 08. 02')
  pickedByUser: Map<Id, string[]>;
}
