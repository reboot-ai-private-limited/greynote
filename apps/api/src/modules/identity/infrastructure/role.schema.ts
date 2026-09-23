import { Schema, model } from 'mongoose';
import { ROLE_NAMES, type RoleName } from '@greynote/contracts';

interface RoleDocument {
  name: RoleName;
}

const roleSchema = new Schema<RoleDocument>({
  name: { type: String, required: true, unique: true, enum: ROLE_NAMES },
});

export const RoleModel = model<RoleDocument>('Role', roleSchema);
