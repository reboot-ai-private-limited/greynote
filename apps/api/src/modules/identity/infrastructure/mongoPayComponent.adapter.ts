import { AppError } from '@/shared/errors/AppError.js';
import type { PayComponent } from '../domain/payComponent.entity.js';
import type { PayComponentRepositoryPort } from '../domain/payComponent.repository.port.js';
import { PayComponentModel, type PayComponentDocument } from './payComponent.schema.js';

function toPayComponent(doc: PayComponentDocument & { _id: unknown }): PayComponent {
  return { id: String(doc._id), code: doc.code, name: doc.name, kind: doc.kind, rule: doc.rule, order: doc.order, isActive: doc.isActive };
}

export class MongoPayComponentAdapter implements PayComponentRepositoryPort {
  async list(): Promise<PayComponent[]> {
    const docs = await PayComponentModel.find().sort({ order: 1 }).lean();
    return docs.map(toPayComponent);
  }

  async findById(id: string): Promise<PayComponent | null> {
    const doc = await PayComponentModel.findById(id).lean();
    return doc ? toPayComponent(doc) : null;
  }

  async create(input: Omit<PayComponent, 'id'>): Promise<PayComponent> {
    const doc = await PayComponentModel.create(input);
    return toPayComponent(doc.toObject());
  }

  async update(id: string, input: Partial<Omit<PayComponent, 'id' | 'code'>>): Promise<PayComponent> {
    const doc = await PayComponentModel.findByIdAndUpdate(id, input, { new: true }).lean();
    if (!doc) throw AppError.internal('INTERNAL', { reason: 'PAY_COMPONENT_NOT_FOUND', id });
    return toPayComponent(doc);
  }
}
