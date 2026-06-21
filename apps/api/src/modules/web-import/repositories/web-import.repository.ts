import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { WebImportJobStatus, WebImportPageStatus } from '@qi-conhecimento/shared-types';
import { WebImportJobEntity, WebImportJobModel } from '../schemas/web-import-job.schema';
import { WebImportPageEntity, WebImportPageModel } from '../schemas/web-import-page.schema';
import { normalizeUrl } from '../utils/url.util';

@Injectable()
export class WebImportRepository {
  constructor(
    @InjectModel(WebImportJobModel.name)
    private readonly jobModel: Model<WebImportJobEntity>,
    @InjectModel(WebImportPageModel.name)
    private readonly pageModel: Model<WebImportPageEntity>,
  ) {}

  createJob(data: Partial<WebImportJobModel>): Promise<WebImportJobEntity> {
    return this.jobModel.create(data);
  }

  findJobById(id: string): Promise<WebImportJobEntity | null> {
    return this.jobModel.findOne({ _id: id, deletedAt: null }).exec();
  }

  findJobs(page: number, limit: number): Promise<[WebImportJobEntity[], number]> {
    return Promise.all([
      this.jobModel
        .find({ deletedAt: null })
        .skip((page - 1) * limit)
        .limit(limit)
        .sort({ createdAt: -1 })
        .exec(),
      this.jobModel.countDocuments({ deletedAt: null }).exec(),
    ]);
  }

  updateJob(
    id: string,
    patch: Partial<WebImportJobModel>,
  ): Promise<WebImportJobEntity | null> {
    return this.jobModel.findOneAndUpdate({ _id: id, deletedAt: null }, patch, { new: true }).exec();
  }

  createPages(
    jobId: string,
    pages: Array<{ url: string; title?: string }>,
  ): Promise<WebImportPageEntity[]> {
    const docs = pages.map((page) => ({
      jobId: new Types.ObjectId(jobId),
      url: page.url,
      canonicalUrl: normalizeUrl(page.url) ?? page.url,
      title: page.title,
      status: WebImportPageStatus.PENDING,
      deletedAt: null,
    }));
    return this.pageModel.insertMany(docs, { ordered: false }).then((result) => result as WebImportPageEntity[]);
  }

  findPages(
    jobId: string,
    page: number,
    limit: number,
    status?: WebImportPageStatus,
  ): Promise<[WebImportPageEntity[], number]> {
    const filter: Record<string, unknown> = {
      jobId: new Types.ObjectId(jobId),
      deletedAt: null,
    };
    if (status) filter['status'] = status;

    return Promise.all([
      this.pageModel
        .find(filter)
        .skip((page - 1) * limit)
        .limit(limit)
        .sort({ createdAt: 1 })
        .exec(),
      this.pageModel.countDocuments(filter).exec(),
    ]);
  }

  findPageById(id: string): Promise<WebImportPageEntity | null> {
    return this.pageModel.findOne({ _id: id, deletedAt: null }).exec();
  }

  findPagesByJobAndStatuses(
    jobId: string,
    statuses: WebImportPageStatus[],
  ): Promise<WebImportPageEntity[]> {
    return this.pageModel
      .find({
        jobId: new Types.ObjectId(jobId),
        status: { $in: statuses },
        deletedAt: null,
      })
      .sort({ createdAt: 1 })
      .exec();
  }

  countPagesByStatus(jobId: string): Promise<Record<string, number>> {
    return this.pageModel
      .aggregate<{ _id: WebImportPageStatus; count: number }>([
        { $match: { jobId: new Types.ObjectId(jobId), deletedAt: null } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ])
      .exec()
      .then((rows) =>
        rows.reduce<Record<string, number>>((acc, row) => {
          acc[row._id] = row.count;
          return acc;
        }, {}),
      );
  }

  updatePage(
    id: string,
    patch: Partial<WebImportPageModel>,
  ): Promise<WebImportPageEntity | null> {
    return this.pageModel.findOneAndUpdate({ _id: id, deletedAt: null }, patch, { new: true }).exec();
  }

  findPageByDocumentId(documentId: string): Promise<WebImportPageEntity | null> {
    return this.pageModel
      .findOne({ documentId: new Types.ObjectId(documentId), deletedAt: null })
      .exec();
  }

  async refreshJobCounters(jobId: string): Promise<WebImportJobEntity | null> {
    const counts = await this.countPagesByStatus(jobId);
    const pagesDiscovered = Object.values(counts).reduce((sum, value) => sum + value, 0);
    return this.updateJob(jobId, {
      pagesDiscovered,
      pagesCompleted: counts[WebImportPageStatus.COMPLETED] ?? 0,
      pagesFailed: counts[WebImportPageStatus.FAILED] ?? 0,
      pagesSkipped: counts[WebImportPageStatus.SKIPPED] ?? 0,
    });
  }

  isJobCancelled(jobId: string): Promise<boolean> {
    return this.jobModel
      .findOne({ _id: jobId, deletedAt: null })
      .select('status')
      .exec()
      .then((job) => job?.status === WebImportJobStatus.CANCELLED);
  }
}
