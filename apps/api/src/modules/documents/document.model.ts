import mongoose, { Schema, type Document, type Model } from 'mongoose';

export type DocumentType = 'resume' | 'cover-letter';
export type TextExtractionStatus = 'missing' | 'pending' | 'complete' | 'partial' | 'failed';

export interface PreviousVersion {
  gridFsFileId: mongoose.Types.ObjectId;
  checksum: string;
  originalFilename: string;
  size: number;
  mimeType: string;
  uploadedAt: Date;
}

export interface OriginalDocumentDoc extends Document {
  ownerId: mongoose.Types.ObjectId;
  originalFilename: string;
  mimeType: string;
  size: number;
  checksum: string; // MD5 of the original file bytes
  documentType: DocumentType;
  gridFsFileId: mongoose.Types.ObjectId; // latest (active) GridFS file
  version: number;
  previousVersions: PreviousVersion[];
  textExtractionStatus: TextExtractionStatus;
  extractedText?: string; // nullable; may be missing
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const originalDocumentSchema = new Schema<OriginalDocumentDoc>(
  {
    ownerId: { type: Schema.Types.ObjectId, required: true, index: true },
    originalFilename: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    checksum: { type: String, required: true, index: true },
    documentType: { type: String, required: true, enum: ['resume', 'cover-letter'] },
    gridFsFileId: { type: Schema.Types.ObjectId, required: true },
    version: { type: Number, required: true, default: 1 },
    previousVersions: [
      {
        gridFsFileId: { type: Schema.Types.ObjectId, required: true },
        checksum: { type: String, required: true },
        originalFilename: { type: String, required: true },
        size: { type: Number, required: true },
        mimeType: { type: String, required: true },
        uploadedAt: { type: Date, required: true },
      },
    ],
    textExtractionStatus: { type: String, required: true, default: 'missing', enum: ['missing', 'pending', 'complete', 'partial', 'failed'] },
    extractedText: { type: String, default: undefined },
    deletedAt: { type: Date, default: undefined },
  },
  { timestamps: true }
);

originalDocumentSchema.index({ ownerId: 1, documentType: 1, deletedAt: 1 });

export const OriginalDocument: Model<OriginalDocumentDoc> =
  mongoose.models.OriginalDocument ??
  mongoose.model<OriginalDocumentDoc>('OriginalDocument', originalDocumentSchema);
