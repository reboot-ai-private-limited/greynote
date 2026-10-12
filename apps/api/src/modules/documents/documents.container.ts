import type { Router } from 'express';
import { DeleteDocumentUseCase, ListDocumentsUseCase, UploadDocumentUseCase } from './application/usecases/documents.usecase.js';
import type { RecipientDirectoryPort } from './domain/ports.js';
import { CloudinaryLibraryStorage } from './infrastructure/cloudinaryDocumentStorage.adapter.js';
import { MongoCompanyDocumentAdapter } from './infrastructure/mongoDocuments.adapter.js';
import { makeDocumentsControllers } from './interface/documents.controller.js';
import { buildDocumentsRouter } from './interface/documents.route.js';

export interface DocumentsContainer {
  buildRouter: () => Router;
}

/** The library of files an Admin shares with employees (LLD documents.md). Identity's public contract, passed in by the composition root; nothing imports from here. */
export function buildDocumentsContainer(directory: RecipientDirectoryPort): DocumentsContainer {
  const docs = new MongoCompanyDocumentAdapter();
  const storage = new CloudinaryLibraryStorage();
  return {
    buildRouter: () => buildDocumentsRouter(makeDocumentsControllers({ upload: new UploadDocumentUseCase(docs, storage, directory), list: new ListDocumentsUseCase(docs), remove: new DeleteDocumentUseCase(docs, storage) })),
  };
}
