import { Types } from 'mongoose';

export function toObjectId(id: string): Types.ObjectId {
  return new Types.ObjectId(id);
}

export function idOf(doc: { _id: Types.ObjectId }): string {
  return doc._id.toHexString();
}

export function isObjectIdString(value: string): boolean {
  return /^[a-f0-9]{24}$/i.test(value);
}
