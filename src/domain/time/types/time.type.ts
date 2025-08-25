import { Id } from 'src/domain/common/types';

export interface TimeStore {
  // userId -> array of time ranges 'HH:mm–HH:mm'
  pickedByUser: Map<Id, string[]>;
}
