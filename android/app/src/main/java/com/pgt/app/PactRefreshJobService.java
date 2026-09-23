package com.pgt.app;

import android.app.job.JobParameters;
import android.app.job.JobService;

/**
 * 一起进步 · 后台刷新的系统任务入口（JobScheduler 周期任务，逻辑见 PactRefresh）。
 * onStartJob 跑在主线程，拉网络挪到子线程，做完自己报告 jobFinished。
 */
public class PactRefreshJobService extends JobService {

    @Override
    public boolean onStartJob(final JobParameters params) {
        new Thread(new Runnable() {
            @Override
            public void run() {
                PactRefresh.check(getApplicationContext());
                // 周期任务：失败了等下个周期，不要求重试
                jobFinished(params, false);
            }
        }, "velvet-pact-refresh").start();
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters params) {
        return false;
    }
}
