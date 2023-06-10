type ResolveFunc<T> = (value?: T) => any;
type RejectFunc = (err?: any) => any;

type SuccessFunc<T> = (value: T) => any;
type FailFunc = (err: any) => any;

class APromise<T = any> 
{
    public static resolve<T>(value?: T): APromise<T>
    {
        if (value instanceof APromise)
        {
            return new APromise((resolve, reject) => 
            {
                value.then(resolve, reject);
            });
        }

        return new APromise((resolve) => resolve(value));
    }

    public static reject<T>(err?: any): APromise<T>
    {
        // TODO: what if "Promise.reject(promise)"?
        return new APromise((resolve, reject) => reject(err));
    }

    public static all(promises: (APromise|any)[]): APromise<any[]>
    {
        return new APromise((resolve, reject) => 
        {
            const results: any[] = [];
            let doneCount = 0;
            let hasErr = false;

            promises.map((promise, i) => 
            {
                if (promise instanceof APromise)
                {
                    promise.then(result => 
                    {
                        if (hasErr)
                            return;

                        doneCount++;
                        results[i] = result;
                        if (doneCount >= promises.length)
                        {
                            resolve(results);
                        }
                    }, (err) => 
                    {
                        hasErr = true;
                        reject(err);
                    });
                }
                else
                {
                    if (hasErr)
                        return;

                    doneCount++;
                    results[i] = promise;
                    if (doneCount >= promises.length)
                    {
                        resolve(results);
                    }
                }
            });
        });
    }


    public static race(promises: any[]): APromise<any>
    {
        return new APromise((resolve, reject) => 
        {
            let hasDone = false;

            return promises.map(promise => 
            {
                if (promise instanceof APromise)
                {
                    promise.then(value => 
                    {
                        if (hasDone)
                            return;

                        hasDone = true;
                        resolve(value);
                    }, err => 
                    {
                        if (hasDone)
                            return;

                        hasDone = true;
                        reject(err);
                    });
                }
                else
                {
                    if (hasDone)
                        return;

                    hasDone = true;
                    resolve(promise);
                }
            });
        });
    }

    public static sleep(ms: number): APromise<number>
    {
        return new APromise((resolve, reject) => 
        {
            try
            {
                setTimeout(() => resolve(ms), ms);
            }
            catch(err)
            {
                reject(err);
            }
        });
    }

    constructor(constructorFunc: (resolve: ResolveFunc<T>, reject: RejectFunc) => any)
    {
        this.id = Math.random();
        // console.log("constructor >>>", this.id);
        const resolve: ResolveFunc<T> = (value?: T) => 
        {
            queueMicrotask(() => 
            {
                if (this.resolved || this.rejected)
                {
                    console.warn("Promise is fulfill");

                    return;
                }

                // @ts-ignore
                this.value = value;
                this.resolved = true;
                for (const success of this.thenSuccessList)
                    success(this.value);
                // this.thenSuccess?.(this.value);
            });
        };

        const reject: RejectFunc = (err?: any) => 
        {
            queueMicrotask(() => 
            {
                if (this.resolved || this.rejected)
                {
                    console.warn("Promise is fulfill");
                    
                    return;
                }

                this.error = err;
                this.rejected = true;
                for (const fail of this.thenFailList)
                    fail(this.error);
                // this.thenFailList?.(this.error);
            });
        };
        // 构造函数同步, resolve, reject 异步
        constructorFunc(resolve, reject);
    }

    public then(success?: SuccessFunc<T>|any, fail?: FailFunc): APromise<T>
    {
        // console.log("call then >>>>>>>>>");
        let promise: APromise<T>;

        return promise = new APromise<T>((resolve, reject) => 
        {
            this.thenSuccessList.push((value) => 
            {
                // console.log("call push successList >>>>>>>>>>>>>", this.id, typeof success === 'function');
                try
                {
                    const successResult = (typeof success === 'function') ? success(value) : this.value;
                    // console.log(">>>>>>>>>>>>>>>>>>>>>>", this.id,  successResult instanceof APromise, successResult === promise, successResult.getId(), promise.getId());
                    const thenable = isThenable(successResult);

                    // successResult instanceof APromise
                    if (thenable)
                    { 
                        if (successResult === promise)
                            reject(new TypeError('circular reference'));
                        else if (successResult instanceof APromise)
                            successResult.then(resolve, reject);
                        else
                        {
                            // TODO: object.then may not typeof function
                            successResult.then((value) => resolve(value), (err) => reject(err));
                            // TODO: circular thenable support
                        }
                    }
                    else
                        resolve(successResult);
                }
                catch(err)
                {
                    reject(err);
                }
            });
    
            this.thenFailList.push((err) => 
            {
                if (typeof fail === 'function')
                {
                    // 注意, 这里回调完then的fail, 后面的promise还是应该是成功状态
                    try 
                    {
                        const value = fail(err);
                        const thenable = isThenable(value);
                        if (thenable)
                        {
                            if (value === promise)
                                reject(new TypeError('circular reference'));
                            else if (value instanceof APromise)
                                value.then(resolve, reject);
                            else
                            {
                                value.then(resolve, reject);
                                // TODO: circular thenable support
                            }
                        }
                        else
                            resolve(value);
                    } 
                    catch(err) 
                    {
                        reject(err);
                    }
                }
                else
                {
                    reject(err);
                }
            });
        });
    }

    public catch(fail: FailFunc): APromise<T>
    {
        // console.log("catch new Promise >>>", !!this.thenFail);
        return this.then(() => null, fail);
    }

    public finally(done: () => any): APromise<T>
    {
        return new APromise((resolve, reject) => 
        {
            this.then((value) => 
            {
                try
                {
                    const result = done();
                    if (result instanceof APromise)
                    {
                        return result.then(() => resolve(value), reject);
                    }
                    else
                    {
                        resolve(value);
                    }
                }
                catch(err)
                {
                    reject(err);
                }
            }, (err) => 
            {
                try 
                {
                    const result = done();
                    if (result instanceof APromise)
                    {
                        return result.then(() => reject(err), () => reject(err));
                    }
                    else
                    {
                        reject(err);
                    }
                } 
                catch (error) 
                {
                    reject(error);
                }
            });
        });
    }

    private id: number;
    private value: T;
    private error: any;
    private resolved = false;
    private rejected = false;
    private thenSuccessList: SuccessFunc<T>[] = [];
    private thenFailList: FailFunc[] = [];

    public isFulFill(): boolean
    {
        return this.resolved || this.rejected;
    }

    public getId(): number
    {
        return this.id;
    }
}

function isThenable(x: any): boolean
{
    return (typeof x==='object' || typeof x === 'function') && x!==null && ('then' in x);
}

class TestAdapter {
    public resolved(value): APromise
    {
        return APromise.resolve(value);
    }

    public rejected(reason): APromise
    {
        return APromise.reject(reason);
    }

    public deferred(): { promise: APromise, resolve: any, reject: any }
    {
        let promise, resolve, reject;

        promise = new APromise((_resolve, _reject) => 
        {
            resolve = _resolve;
            reject = _reject;
        });

        return {
            promise,
            resolve, 
            reject,
        };
    }
}


module.exports = new TestAdapter

// new APromise((resolve, reject) => 
// {
//     setTimeout(() => 
//     {
//         // @ts-ignore
//         resolve(123);
//     }, 500)
// }).
// then((value) => 
// {
//     console.log("then >>>", value);

//     return APromise.resolve(456).then((value) => 
//     {
//         console.log("inner then >>>", value);
//         return new APromise((resolve) => setTimeout(resolve, 1000));
//     });
// }).
// then((value) => 
// {
//     console.log("then2 >>>", value);
// }).
// catch(err => 
// {
//     console.log("catch >>>", err);

//     return APromise.resolve(321);
// }).
// then((value) => 
// {
//     console.log("then after catch >>>", value);
//     return APromise.reject(new Error('123'));
// }).
// then((value) => 
// {
//     console.log(">>>>>>>", value);
// }).
// catch(err => 
// {
//     console.log("final catch >>>>>>>", err);
// });

// APromise.resolve(APromise.resolve(123)).
// // then(() => console.log("then success"), () => console.log("then fail")).
// then((value) => console.log("then success", value)).
// catch(err => 
// {
//     console.log("catch >>>", err);

//     return APromise.resolve('repaired');
// }).
// then((value) => 
// {
//     console.log("then after catch >>>", value);
// });


// APromise.resolve(123).then((value) => 
// {
//     console.log("then >>>", value);

//     throw new Error("error occurred");
// }).
// catch(err => 
// {
//     console.log("catch >>>", err);
//     throw new Error("another error");
// }).
// then(() => 
// {
//     console.log("then after catch");
// }, (err) => 
// {
//     console.log("then after, fail", err);

//     return 123456;
// }).
// then((value) => 
// {
//     console.log("final then >>>", value);
// });

// APromise.resolve(123).then(() => 
// {
//     return APromise.reject(123123123);
// }).
// finally(() => 
// {
//     console.log("finally >>>");
//     throw new Error("123");
// }).
// then(() => {console.log("then >>>")}).
// catch(err => {console.log("catch >>>", err)})


// APromise.all([
//     123,
//     APromise.resolve(456),
//     APromise.sleep(1000),
//     APromise.sleep(230),
// ]).then((value) => 
// {
//     console.log("then >>>", value);
// });

// APromise.all([
//     123,
//     APromise.resolve(456).then(() => APromise.reject(new Error('error occurred'))),
//     APromise.sleep(1000),
//     APromise.sleep(230),

// ]).then((value) => 
// {
//     console.log("then >>>", value);
// }).catch((err) => 
// {
//     console.log("catch >>>", err);
// });

// APromise.race([
//     // APromise.resolve(456).then(() => APromise.reject(new Error('error occurred'))),
//     APromise.sleep(1000),
//     APromise.sleep(230),
//     APromise.sleep(130),

// ]).then((value) => 
// {
//     console.log("then >>>", value);
// }).catch((err) => 
// {
//     console.log("catch >>>", err);
// });

// new APromise((resolve, reject) => 
// {
//     resolve(123);
//     reject(456);
// }).then(console.log, console.error);

// var firstOnFulfilledFinished = false;
// let promise = APromise.resolve();
// promise.then(function () 
// {
//     promise.then(function () 
//     {
//         console.log("firstOnFulfilledFinished >>>", firstOnFulfilledFinished);
//     });
//     console.log(">>>>>>>>>>>>>");
//     firstOnFulfilledFinished = true;
// });

// let promise = APromise.resolve();
// promise.then(() => console.log(11111));
// promise.then(() => console.log(22222));
// promise.then(() => console.log(33333));
// promise.then(() => console.log(44444));
// promise.then(() => console.log(55555));

// let promise = APromise.reject('error occurred');
// promise.catch(() => console.log(11111));
// promise.catch(() => console.log(22222));
// promise.catch(() => console.log(33333));
// promise.catch(() => console.log(44444));
// promise.catch(() => console.log(55555));

// let promise = APromise.resolve(0);
// promise.then(() => 11111).then((value) => console.log(">>>", value));
// promise.then(() => (22222)).then((value) => console.log(">>>", value));
// promise.then(() => (33333)).then((value) => console.log(">>>", value));
// promise.then(() => (44444)).then((value) => console.log(">>>", value));
// promise.then(() => (55555)).then((value) => console.log(">>>", value));


// const promise1 = APromise.resolve(123);
// const promise2 = promise1.then(false);

// promise2.then((value) => 
// {
//     console.log("promise2 then >>>", value);
// });


// var promise = APromise.resolve(123).
// then(function () {
//     console.log("then >>>");
//     return promise;
// });

// console.log("sync code >>>", promise.getId());

// promise.then(null, function (reason) {
//     console.log("should print this", reason);
// });

// var promise = APromise.resolve(123).then(() => ({
//     then: function(fulfill) {
//         return fulfill(456);
//     }
// })).
// let count = 0;
// var promise = APromise.resolve(123).then(() => Object.create(null, {
//     then: {
//         get: function () {
//             console.log(">>>>>>>>>>> call get");
//             ++count;
//             return function thenMethodForX(onFulfilled) {
//                 onFulfilled();
//             };
//         }
//     }
// }));

// promise.then((value) => 
// {
//     console.log("then >>>", count);

//     return {
//         then: function(fulfill) {
//             return {
//                 then: function(fulfill) {
//                     return fulfill(456);
//                 }
//             };
//         }
//     };
// }).
// then(value => 
// {
//     console.log("final then >>>", value);
// });

// APromise.resolve(123).then((value) => ({
//     then: function(fulfill) {
//         return fulfill(value);
//     }
// })).then((value) => console.log(">>>>", value));

// APromise.resolve(456).then((value) => ({
//     then: function(fulfill) {
//         return fulfill(value);
//     }
// })).then((value) => console.log(">>>>", value));

// APromise.resolve(789).then((value) => ({
//     then: function(fulfill) {
//         return fulfill(value);
//     }
// })).then((value) => console.log(">>>>", value));
