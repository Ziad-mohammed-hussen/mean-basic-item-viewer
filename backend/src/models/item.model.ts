import mongoose, { Document, Model, Schema } from 'mongoose';

export interface IItem {
  name: string;
  description?: string;
  category?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IItemDocument extends IItem, Document {}

const itemSchema = new Schema<IItemDocument>(
  {
    name: {
      type: String,
      required: [true, 'Item name is required'],
      trim: true,
      maxlength: [160, 'Item name cannot exceed 160 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [1000, 'Description cannot exceed 1000 characters'],
    },
    category: {
      type: String,
      trim: true,
      maxlength: [80, 'Category cannot exceed 80 characters'],
    },
  },
  {
    timestamps: true,
    versionKey: false,
    collection: 'items',
  }
);

export const Item: Model<IItemDocument> =
  mongoose.models.Item || mongoose.model<IItemDocument>('Item', itemSchema);
